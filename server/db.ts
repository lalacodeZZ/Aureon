import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { computeWebhookHmac } from './security.ts';
import type {
  AgentRunRecord,
  AgentStageId,
  FailureClass,
  GatewayStatus,
  IncidentDossier,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  MerchantOrderRecord,
  OrderStatus,
  RecoveryApprovalRecord,
  TelemetryPoint,
  WebhookEventRecord,
} from './types.ts';

const STAGE_TEMPLATES: Array<{ stage_index: number; stage_id: AgentStageId; agent_name: string }> = [
  { stage_index: 0, stage_id: 'reconciler', agent_name: 'Order & Gateway Reconciler' },
  { stage_index: 1, stage_id: 'crypto_forensics', agent_name: 'Signature & Replay Forensics' },
  { stage_index: 2, stage_id: 'ordering_guard', agent_name: 'Ordering & Idempotency Guard' },
  { stage_index: 3, stage_id: 'recovery_planner', agent_name: 'Safe Recovery Planner' },
  { stage_index: 4, stage_id: 'approval_gate', agent_name: 'Human Governance Gate' },
];

export interface AureonDatabase {
  db: Database.Database;
  listIncidents: () => IncidentRecord[];
  listOrders: () => MerchantOrderRecord[];
  getIncidentDossier: (incidentId: string) => IncidentDossier | null;
  getProcessedEventIds: () => Set<string>;
  updateIncidentStatus: (incidentId: string, status: IncidentStatus) => void;
  updateOrderStatus: (orderId: string, orderStatus: OrderStatus, eventType?: string) => void;
  updateAgentRun: (
    incidentId: string,
    stageId: AgentStageId,
    patch: Partial<
      Pick<
        AgentRunRecord,
        'status' | 'summary' | 'findings_json' | 'duration_ms' | 'started_at' | 'completed_at'
      >
    >,
  ) => void;
  resetAgentRuns: (incidentId: string) => void;
  insertRecoveryApproval: (record: RecoveryApprovalRecord) => void;
  recordLiveWebhookEvent: (ev: WebhookEventRecord) => void;
  simulateIncident: (params: {
    failureClass: FailureClass;
    amountPaise: number;
    severity: IncidentSeverity;
  }) => IncidentDossier;
  resetScenarios: () => void;
  close: () => void;
}

function buildWebhookPayload(params: {
  eventId: string;
  eventType: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  createdAtUnix: number;
  prettyFormat?: boolean;
}): string {
  const obj = {
    entity: 'event',
    account_id: 'acc_AureonMerch01',
    event: params.eventType,
    contains: ['payment', 'order'],
    payload: {
      payment: {
        entity: {
          id: params.paymentId,
          entity: 'payment',
          amount: params.amountPaise,
          currency: 'INR',
          status: params.eventType === 'payment.failed' ? 'failed' : 'captured',
          order_id: params.orderId,
          method: 'upi',
          vpa: 'arjun.mehta@okicici',
          email: 'arjun.mehta@enterprise-client.in',
        },
      },
      order: {
        entity: {
          id: params.orderId,
          entity: 'order',
          amount: params.amountPaise,
          status: params.eventType === 'order.paid' ? 'paid' : 'attempted',
        },
      },
    },
    created_at: params.createdAtUnix,
    event_id: params.eventId,
  };
  return params.prettyFormat ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
}

function buildTelemetrySeries(
  retryPeak: number,
  sigErrorPeak: number,
  latencyPeakMs: number,
): TelemetryPoint[] {
  return [
    { timestamp: '06:00', verifiedCaptures: 142, retryFailures5xx: 1, signatureErrors: 0, deliveryLatencyMs: 140 },
    { timestamp: '06:05', verifiedCaptures: 158, retryFailures5xx: 2, signatureErrors: 0, deliveryLatencyMs: 165 },
    { timestamp: '06:10', verifiedCaptures: 151, retryFailures5xx: Math.round(retryPeak * 0.45), signatureErrors: Math.round(sigErrorPeak * 0.3), deliveryLatencyMs: Math.round(latencyPeakMs * 0.52) },
    { timestamp: '06:15', verifiedCaptures: 134, retryFailures5xx: retryPeak, signatureErrors: sigErrorPeak, deliveryLatencyMs: latencyPeakMs },
    { timestamp: '06:20', verifiedCaptures: 149, retryFailures5xx: Math.round(retryPeak * 0.6), signatureErrors: Math.round(sigErrorPeak * 0.4), deliveryLatencyMs: Math.round(latencyPeakMs * 0.61) },
    { timestamp: '06:25', verifiedCaptures: 164, retryFailures5xx: 2, signatureErrors: 0, deliveryLatencyMs: 175 },
  ];
}

function seedDefaultIncidents(db: Database.Database) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();

  const insertOrder = db.prepare(`
    INSERT INTO merchant_orders (
      order_id, payment_id, customer_ref, amount_paise, currency, order_status, gateway_status, last_event_type, last_event_unix, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertIncident = db.prepare(`
    INSERT INTO incidents (
      id, code, title, failure_class, severity, status, order_id, gateway_payment_id,
      amount_paise, currency, affected_node_id, summary, telemetry_json, evidence_json, audit_digest, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertWebhook = db.prepare(`
    INSERT INTO webhook_events (
      id, incident_id, event_id, event_type, order_id, payment_id, amount_paise, raw_payload,
      received_signature, computed_signature, signature_valid, replay_detected, out_of_order,
      http_status_returned, retry_attempt, source_ip, delivery_status, created_at_unix, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRun = db.prepare(`
    INSERT INTO agent_runs (
      id, incident_id, stage_index, stage_id, agent_name, status, summary, findings_json, duration_ms, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const scenarios = [
    {
      id: 'inc-wh-01',
      code: 'INC-2026-0901',
      title: 'Missed Payment Capture Webhook — Order Stuck Pending',
      failure_class: 'MISSED_WEBHOOK' as FailureClass,
      severity: 'CRITICAL' as IncidentSeverity,
      order_id: 'ORD-90412',
      payment_id: 'pay_Q9x7Lm0412A',
      customer_ref: 'Meridian Luxury Exports',
      amount_paise: 4_850_000, // ₹48,500.00
      order_status: 'PENDING' as OrderStatus,
      gateway_status: 'captured' as GatewayStatus,
      affected_node_id: 'node-ingress-gateway',
      summary:
        'Customer payment pay_Q9x7Lm0412A (INR 48,500.00) succeeded and reached captured on Razorpay, but merchant /webhooks/razorpay timed out (504) across 3 exponential-backoff retries leaving ORD-90412 stuck in PENDING.',
      telemetry: buildTelemetrySeries(19, 1, 4920),
      evidence: {
        rootCauseHint: 'Merchant worker pool timeout during checkout flash load; HMAC-SHA256 signature was valid on delivery attempts.',
        webhookSecretRef: 'whsec_aureon_sandbox_9948271a',
        apiKeyRef: 'rzp_live_8812AureonKey',
        recommendedActions: [
          'Verify gateway payment pay_Q9x7Lm0412A status via authoritative Fetch Payment check',
          'Reconcile merchant order ORD-90412 from PENDING to RECONCILED idempotently',
          'Decouple webhook acknowledgement (200 OK) from async queue processing',
        ],
      },
      webhooks: [
        {
          event_id: 'evt_90412_auth_01',
          event_type: 'payment.authorized',
          http_status: 200,
          retry_attempt: 1,
          source_ip: '52.66.195.14',
          delivery_status: 'DELIVERED' as const,
          validSig: true,
          replay: false,
          outOfOrder: false,
          offsetSec: -210,
          pretty: false,
        },
        {
          event_id: 'evt_90412_cap_02',
          event_type: 'payment.captured',
          http_status: 504,
          retry_attempt: 1,
          source_ip: '52.66.195.14',
          delivery_status: 'FAILED_5XX' as const,
          validSig: true,
          replay: false,
          outOfOrder: false,
          offsetSec: -140,
          pretty: false,
        },
        {
          event_id: 'evt_90412_cap_02',
          event_type: 'payment.captured',
          http_status: 502,
          retry_attempt: 3,
          source_ip: '52.66.195.14',
          delivery_status: 'FAILED_5XX' as const,
          validSig: true,
          replay: false,
          outOfOrder: false,
          offsetSec: -45,
          pretty: false,
        },
      ],
    },
    {
      id: 'inc-wh-02',
      code: 'INC-2026-0902',
      title: 'Duplicate Delivery & Out-of-Order Event Race',
      failure_class: 'DUPLICATE_OUT_OF_ORDER' as FailureClass,
      severity: 'HIGH' as IncidentSeverity,
      order_id: 'ORD-90418',
      payment_id: 'pay_Q9x8Kp0418B',
      customer_ref: 'Atelier Horology Pvt Ltd',
      amount_paise: 12_400_000, // ₹1,24,000.00
      order_status: 'PENDING' as OrderStatus,
      gateway_status: 'captured' as GatewayStatus,
      affected_node_id: 'node-idempotency-gate',
      summary:
        'Gateway delivered order.paid before payment.authorized due to network jitter, followed by a delayed payment.authorized retry and duplicate payment.captured event that tripped unguarded merchant state transitions.',
      telemetry: buildTelemetrySeries(8, 2, 1850),
      evidence: {
        rootCauseHint: 'Naive status overwrite regressed order state when an older retried payment.authorized arrived after order.paid.',
        webhookSecretRef: 'whsec_aureon_sandbox_9948271a',
        apiKeyRef: 'rzp_live_8812AureonKey',
        recommendedActions: [
          'Enforce monotonic event timestamp & state precedence guard on ORD-90418',
          'Deduplicate repeated X-Razorpay-Event-Id evt_90418_cap_03 via processed_events key',
          'Promote ORD-90418 safely to RECONCILED without double-fulfillment',
        ],
      },
      webhooks: [
        {
          event_id: 'evt_90418_paid_01',
          event_type: 'order.paid',
          http_status: 200,
          retry_attempt: 1,
          source_ip: '52.66.195.22',
          delivery_status: 'DELIVERED' as const,
          validSig: true,
          replay: false,
          outOfOrder: false,
          offsetSec: -180,
          pretty: false,
        },
        {
          event_id: 'evt_90418_auth_late',
          event_type: 'payment.authorized',
          http_status: 200,
          retry_attempt: 2,
          source_ip: '52.66.195.22',
          delivery_status: 'DELIVERED' as const,
          validSig: true,
          replay: false,
          outOfOrder: true,
          offsetSec: -220, // Older created_at arriving later!
          pretty: false,
        },
        {
          event_id: 'evt_90418_cap_03',
          event_type: 'payment.captured',
          http_status: 200,
          retry_attempt: 2,
          source_ip: '52.66.195.22',
          delivery_status: 'REPLAY_BLOCKED' as const,
          validSig: true,
          replay: true,
          outOfOrder: false,
          offsetSec: -30,
          pretty: false,
        },
      ],
    },
    {
      id: 'inc-wh-03',
      code: 'INC-2026-0903',
      title: 'Invalid X-Razorpay-Signature & Replay Attack Probe',
      failure_class: 'INVALID_SIGNATURE_REPLAY' as FailureClass,
      severity: 'CRITICAL' as IncidentSeverity,
      order_id: 'ORD-90425',
      payment_id: 'pay_SPOOF99425Z',
      customer_ref: 'Sovereign Bullion Desk',
      amount_paise: 29_500_000, // ₹2,95,000.00
      order_status: 'PENDING' as OrderStatus,
      gateway_status: 'failed' as GatewayStatus,
      affected_node_id: 'node-crypto-gate',
      summary:
        'Unrecognized source IP 185.220.101.44 injected forged payment.captured webhooks with invalid X-Razorpay-Signature headers and replayed event IDs while authoritative gateway payment pay_SPOOF99425Z remains failed.',
      telemetry: buildTelemetrySeries(4, 27, 620),
      evidence: {
        rootCauseHint: 'Cryptographic HMAC-SHA256 mismatch + stale replayed X-Razorpay-Event-Id from non-Razorpay egress IP; order MUST NOT be marked paid.',
        webhookSecretRef: 'whsec_aureon_sandbox_9948271a',
        apiKeyRef: 'rzp_live_8812AureonKey',
        recommendedActions: [
          'Quarantine ORD-90425 and reject forged payment.captured payload',
          'Block source IP 185.220.101.44 and rotate webhook signing secret',
          'Audit Express raw-body middleware to prevent JSON re-parsing bypasses',
        ],
      },
      webhooks: [
        {
          event_id: 'evt_90425_forged_01',
          event_type: 'payment.captured',
          http_status: 400,
          retry_attempt: 1,
          source_ip: '185.220.101.44',
          delivery_status: 'SIG_INVALID' as const,
          validSig: false,
          replay: false,
          outOfOrder: false,
          offsetSec: -120,
          pretty: true, // Demonstrates formatting/tampering mismatch
        },
        {
          event_id: 'evt_90412_cap_02', // Replayed event_id from another order!
          event_type: 'payment.captured',
          http_status: 409,
          retry_attempt: 1,
          source_ip: '185.220.101.44',
          delivery_status: 'REPLAY_BLOCKED' as const,
          validSig: false,
          replay: true,
          outOfOrder: false,
          offsetSec: -900, // Stale timestamp skew
          pretty: false,
        },
      ],
    },
  ];

  for (const s of scenarios) {
    const auditDigest = crypto
      .createHash('sha256')
      .update(`${s.id}|${s.order_id}|${s.failure_class}|${s.amount_paise}`)
      .digest('hex');

    insertOrder.run(
      s.order_id,
      s.payment_id,
      s.customer_ref,
      s.amount_paise,
      'INR',
      s.order_status,
      s.gateway_status,
      s.webhooks[0].event_type,
      nowUnix + s.webhooks[0].offsetSec,
      nowIso,
    );

    insertIncident.run(
      s.id,
      s.code,
      s.title,
      s.failure_class,
      s.severity,
      'OPEN',
      s.order_id,
      s.payment_id,
      s.amount_paise,
      'INR',
      s.affected_node_id,
      s.summary,
      JSON.stringify(s.telemetry),
      JSON.stringify(s.evidence),
      auditDigest,
      nowIso,
      nowIso,
    );

    s.webhooks.forEach((w, idx) => {
      const createdUnix = nowUnix + w.offsetSec;
      const rawPayload = buildWebhookPayload({
        eventId: w.event_id,
        eventType: w.event_type,
        orderId: s.order_id,
        paymentId: s.payment_id,
        amountPaise: s.amount_paise,
        createdAtUnix: createdUnix,
        prettyFormat: w.pretty,
      });
      const computedSig = computeWebhookHmac(rawPayload);
      const receivedSig = w.validSig
        ? computedSig
        : 'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb';

      insertWebhook.run(
        `${s.id}-wh-${idx + 1}`,
        s.id,
        w.event_id,
        w.event_type,
        s.order_id,
        s.payment_id,
        s.amount_paise,
        rawPayload,
        receivedSig,
        computedSig,
        w.validSig ? 1 : 0,
        w.replay ? 1 : 0,
        w.outOfOrder ? 1 : 0,
        w.http_status,
        w.retry_attempt,
        w.source_ip,
        w.delivery_status,
        createdUnix,
        new Date((nowUnix + w.offsetSec + idx * 12) * 1000).toISOString(),
      );
    });

    for (const tmpl of STAGE_TEMPLATES) {
      insertRun.run(
        `${s.id}-stage-${tmpl.stage_id}`,
        s.id,
        tmpl.stage_index,
        tmpl.stage_id,
        tmpl.agent_name,
        'QUEUED',
        'Awaiting webhook multi-agent investigation dispatch.',
        JSON.stringify({}),
        0,
        null,
        null,
      );
    }
  }
}

export function createDatabase(dbPath?: string): AureonDatabase {
  const resolvedPath =
    dbPath ?? process.env.AUREON_DB_PATH ?? path.resolve(process.cwd(), 'data', 'aureon_webhooks.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  if (resolvedPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS merchant_orders (
      order_id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      customer_ref TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL,
      order_status TEXT NOT NULL,
      gateway_status TEXT NOT NULL,
      last_event_type TEXT NOT NULL,
      last_event_unix INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      failure_class TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      order_id TEXT NOT NULL,
      gateway_payment_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL,
      affected_node_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      telemetry_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      audit_digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES merchant_orders(order_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      received_signature TEXT NOT NULL,
      computed_signature TEXT NOT NULL,
      signature_valid INTEGER NOT NULL,
      replay_detected INTEGER NOT NULL,
      out_of_order INTEGER NOT NULL,
      http_status_returned INTEGER NOT NULL,
      retry_attempt INTEGER NOT NULL,
      source_ip TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      created_at_unix INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      stage_index INTEGER NOT NULL,
      stage_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_approvals (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      rationale TEXT NOT NULL,
      state_before TEXT NOT NULL,
      state_after TEXT NOT NULL,
      containment_actions_json TEXT NOT NULL,
      verification_digest TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) AS count FROM incidents').get() as { count: number };
  if (countRow.count === 0) {
    seedDefaultIncidents(db);
  }

  return {
    db,
    listIncidents() {
      return db
        .prepare('SELECT * FROM incidents ORDER BY created_at DESC, code ASC')
        .all() as IncidentRecord[];
    },
    listOrders() {
      return db
        .prepare('SELECT * FROM merchant_orders ORDER BY updated_at DESC')
        .all() as MerchantOrderRecord[];
    },
    getIncidentDossier(incidentId: string) {
      const incident = db
        .prepare('SELECT * FROM incidents WHERE id = ?')
        .get(incidentId) as IncidentRecord | undefined;
      if (!incident) return null;

      const order = db
        .prepare('SELECT * FROM merchant_orders WHERE order_id = ?')
        .get(incident.order_id) as MerchantOrderRecord;

      const webhookEvents = db
        .prepare('SELECT * FROM webhook_events WHERE incident_id = ? ORDER BY received_at ASC')
        .all(incidentId) as WebhookEventRecord[];

      const agentRuns = db
        .prepare('SELECT * FROM agent_runs WHERE incident_id = ? ORDER BY stage_index ASC')
        .all(incidentId) as AgentRunRecord[];

      const approvals = db
        .prepare('SELECT * FROM recovery_approvals WHERE incident_id = ? ORDER BY decided_at DESC')
        .all(incidentId) as RecoveryApprovalRecord[];

      return { incident, order, webhookEvents, agentRuns, approvals };
    },
    getProcessedEventIds() {
      const rows = db
        .prepare('SELECT DISTINCT event_id FROM webhook_events WHERE delivery_status = ?')
        .all('DELIVERED') as Array<{ event_id: string }>;
      return new Set(rows.map((r) => r.event_id));
    },
    updateIncidentStatus(incidentId: string, status: IncidentStatus) {
      db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        new Date().toISOString(),
        incidentId,
      );
    },
    updateOrderStatus(orderId: string, orderStatus: OrderStatus, eventType?: string) {
      const nowIso = new Date().toISOString();
      if (eventType) {
        db.prepare(
          'UPDATE merchant_orders SET order_status = ?, last_event_type = ?, updated_at = ? WHERE order_id = ?',
        ).run(orderStatus, eventType, nowIso, orderId);
      } else {
        db.prepare('UPDATE merchant_orders SET order_status = ?, updated_at = ? WHERE order_id = ?').run(
          orderStatus,
          nowIso,
          orderId,
        );
      }
    },
    updateAgentRun(incidentId, stageId, patch) {
      const current = db
        .prepare('SELECT * FROM agent_runs WHERE incident_id = ? AND stage_id = ?')
        .get(incidentId, stageId) as AgentRunRecord | undefined;
      if (!current) return;

      db.prepare(`
        UPDATE agent_runs
        SET status = ?, summary = ?, findings_json = ?, duration_ms = ?, started_at = ?, completed_at = ?
        WHERE incident_id = ? AND stage_id = ?
      `).run(
        patch.status ?? current.status,
        patch.summary ?? current.summary,
        patch.findings_json ?? current.findings_json,
        patch.duration_ms ?? current.duration_ms,
        patch.started_at !== undefined ? patch.started_at : current.started_at,
        patch.completed_at !== undefined ? patch.completed_at : current.completed_at,
        incidentId,
        stageId,
      );
    },
    resetAgentRuns(incidentId: string) {
      db.prepare(`
        UPDATE agent_runs
        SET status = 'QUEUED',
            summary = 'Awaiting webhook multi-agent investigation dispatch.',
            findings_json = '{}',
            duration_ms = 0,
            started_at = NULL,
            completed_at = NULL
        WHERE incident_id = ?
      `).run(incidentId);
    },
    insertRecoveryApproval(record: RecoveryApprovalRecord) {
      db.prepare(`
        INSERT INTO recovery_approvals (
          id, incident_id, order_id, decision, operator_name, operator_role, rationale,
          state_before, state_after, containment_actions_json, verification_digest, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.incident_id,
        record.order_id,
        record.decision,
        record.operator_name,
        record.operator_role,
        record.rationale,
        record.state_before,
        record.state_after,
        record.containment_actions_json,
        record.verification_digest,
        record.decided_at,
      );
    },
    recordLiveWebhookEvent(ev: WebhookEventRecord) {
      db.prepare(`
        INSERT INTO webhook_events (
          id, incident_id, event_id, event_type, order_id, payment_id, amount_paise, raw_payload,
          received_signature, computed_signature, signature_valid, replay_detected, out_of_order,
          http_status_returned, retry_attempt, source_ip, delivery_status, created_at_unix, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ev.id,
        ev.incident_id,
        ev.event_id,
        ev.event_type,
        ev.order_id,
        ev.payment_id,
        ev.amount_paise,
        ev.raw_payload,
        ev.received_signature,
        ev.computed_signature,
        ev.signature_valid,
        ev.replay_detected,
        ev.out_of_order,
        ev.http_status_returned,
        ev.retry_attempt,
        ev.source_ip,
        ev.delivery_status,
        ev.created_at_unix,
        ev.received_at,
      );
    },
    simulateIncident({ failureClass, amountPaise, severity }) {
      const suffix = Math.floor(1000 + Math.random() * 8999);
      const id = `inc-sim-${suffix}`;
      const code = `INC-2026-${suffix}`;
      const orderId = `ORD-${suffix}`;
      const paymentId = `pay_SIM${suffix}Z`;
      const nowUnix = Math.floor(Date.now() / 1000);
      const nowIso = new Date().toISOString();

      const isAttack = failureClass === 'INVALID_SIGNATURE_REPLAY' || failureClass === 'SUSPICIOUS_BURST';
      const gatewayStatus: GatewayStatus = isAttack ? 'failed' : 'captured';
      const affectedNode =
        failureClass === 'MISSED_WEBHOOK'
          ? 'node-ingress-gateway'
          : failureClass === 'DUPLICATE_OUT_OF_ORDER'
            ? 'node-idempotency-gate'
            : 'node-crypto-gate';

      const titleMap: Record<FailureClass, string> = {
        MISSED_WEBHOOK: 'Simulated Missed Capture Webhook — Order Stuck Pending',
        DUPLICATE_OUT_OF_ORDER: 'Simulated Duplicate & Out-of-Order Webhook Race',
        INVALID_SIGNATURE_REPLAY: 'Simulated Forged Signature & Replay Probe',
        SUSPICIOUS_BURST: 'Simulated High-Velocity Webhook Anomaly Burst',
      };

      db.prepare(`
        INSERT INTO merchant_orders (
          order_id, payment_id, customer_ref, amount_paise, currency, order_status, gateway_status, last_event_type, last_event_unix, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        paymentId,
        `Synthetic Merchant #${suffix}`,
        amountPaise,
        'INR',
        'PENDING',
        gatewayStatus,
        'payment.captured',
        nowUnix - 60,
        nowIso,
      );

      const rawPayload = buildWebhookPayload({
        eventId: `evt_sim_${suffix}`,
        eventType: 'payment.captured',
        orderId,
        paymentId,
        amountPaise,
        createdAtUnix: nowUnix - 60,
        prettyFormat: isAttack,
      });
      const computedSig = computeWebhookHmac(rawPayload);
      const receivedSig = isAttack ? 'bad000111222333444555666777888999aaabbbcccdddeeefff001122334455' : computedSig;

      const auditDigest = crypto
        .createHash('sha256')
        .update(`${id}|${orderId}|${failureClass}|${amountPaise}`)
        .digest('hex');

      const telemetry = buildTelemetrySeries(isAttack ? 5 : 16, isAttack ? 22 : 1, isAttack ? 780 : 4100);
      const evidence = {
        rootCauseHint: isAttack
          ? 'Injected invalid X-Razorpay-Signature and replay indicator from untrusted IP.'
          : 'Injected webhook 504 delivery timeout while gateway payment reached captured.',
        webhookSecretRef: 'whsec_aureon_sandbox_9948271a',
        recommendedActions: isAttack
          ? [
              `Quarantine ${orderId} and reject unverified webhook payload`,
              'Block offending source IP and inspect raw-body HMAC middleware',
            ]
          : [
              `Confirm authoritative gateway capture for ${paymentId}`,
              `Reconcile ${orderId} idempotently to RECONCILED`,
            ],
      };

      db.prepare(`
        INSERT INTO incidents (
          id, code, title, failure_class, severity, status, order_id, gateway_payment_id,
          amount_paise, currency, affected_node_id, summary, telemetry_json, evidence_json, audit_digest, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        code,
        titleMap[failureClass],
        failureClass,
        severity,
        'OPEN',
        orderId,
        paymentId,
        amountPaise,
        'INR',
        affectedNode,
        `Synthetic ${failureClass} fault injected on ${orderId} (INR ${(amountPaise / 100).toLocaleString('en-IN')}).`,
        JSON.stringify(telemetry),
        JSON.stringify(evidence),
        auditDigest,
        nowIso,
        nowIso,
      );

      db.prepare(`
        INSERT INTO webhook_events (
          id, incident_id, event_id, event_type, order_id, payment_id, amount_paise, raw_payload,
          received_signature, computed_signature, signature_valid, replay_detected, out_of_order,
          http_status_returned, retry_attempt, source_ip, delivery_status, created_at_unix, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${id}-wh-1`,
        id,
        `evt_sim_${suffix}`,
        'payment.captured',
        orderId,
        paymentId,
        amountPaise,
        rawPayload,
        receivedSig,
        computedSig,
        isAttack ? 0 : 1,
        failureClass === 'DUPLICATE_OUT_OF_ORDER' || isAttack ? 1 : 0,
        failureClass === 'DUPLICATE_OUT_OF_ORDER' ? 1 : 0,
        isAttack ? 400 : 504,
        failureClass === 'MISSED_WEBHOOK' ? 3 : 1,
        isAttack ? '198.51.100.77' : '52.66.195.14',
        isAttack ? 'SIG_INVALID' : 'FAILED_5XX',
        nowUnix - 60,
        nowIso,
      );

      const insertRun = db.prepare(`
        INSERT INTO agent_runs (
          id, incident_id, stage_index, stage_id, agent_name, status, summary, findings_json, duration_ms, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const tmpl of STAGE_TEMPLATES) {
        insertRun.run(
          `${id}-stage-${tmpl.stage_id}`,
          id,
          tmpl.stage_index,
          tmpl.stage_id,
          tmpl.agent_name,
          'QUEUED',
          'Awaiting webhook multi-agent investigation dispatch.',
          JSON.stringify({}),
          0,
          null,
          null,
        );
      }

      return this.getIncidentDossier(id)!;
    },
    resetScenarios() {
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM recovery_approvals').run();
        db.prepare('DELETE FROM webhook_events').run();
        db.prepare('DELETE FROM agent_runs').run();
        db.prepare('DELETE FROM incidents').run();
        db.prepare('DELETE FROM merchant_orders').run();
        seedDefaultIncidents(db);
      });
      tx();
    },
    close() {
      db.close();
    },
  };
}
