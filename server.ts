import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createDatabase, type AureonDatabase } from './server/db.ts';
import { runWebhookInvestigation, subscribeIncidentStream } from './server/orchestrator.ts';
import {
  computeWebhookHmac,
  evaluateReplayAndSkew,
  generateRecoverySeal,
  getActiveWebhookSecret,
  redactWebhookSecrets,
  verifyWebhookSignature,
} from './server/security.ts';
import type { FailureClass, IncidentSeverity } from './server/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createAureonApp(store: AureonDatabase) {
  const app = express();

  // Raw-body Razorpay webhook receiver BEFORE global express.json()
  app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
    const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
    const rawPayload = rawBuffer.toString('utf8');
    const signature = String(req.headers['x-razorpay-signature'] ?? '');
    const eventId = String(req.headers['x-razorpay-event-id'] ?? `evt_live_${Date.now()}`);

    const sigCheck = verifyWebhookSignature(rawPayload, signature);
    if (!sigCheck.valid) {
      return res.status(400).json({
        status: 'rejected',
        reason: sigCheck.reason,
        providedPrefix: sigCheck.providedPrefix,
        expectedPrefix: sigCheck.expectedPrefix,
      });
    }

    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      return res.status(400).json({ status: 'rejected', reason: 'Malformed JSON body.' });
    }

    const processedIds = store.getProcessedEventIds();
    const createdAtUnix = Number(parsed.created_at ?? Math.floor(Date.now() / 1000));
    const replayCheck = evaluateReplayAndSkew(eventId, createdAtUnix, processedIds);

    if (replayCheck.replayDetected) {
      return res.status(200).json({
        status: 'idempotent_noop',
        eventId,
        reason: replayCheck.reason,
      });
    }

    return res.status(200).json({
      status: 'accepted',
      eventId,
      signatureValid: true,
      replayDetected: false,
      skewSeconds: replayCheck.skewSeconds,
    });
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const incidents = store.listIncidents();
    const orders = store.listOrders();
    res.json({
      status: 'ok',
      service: 'aureon-webhook-control-plane',
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
      incidentCount: incidents.length,
      orderCount: orders.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/incidents', (_req, res) => {
    const incidents = store.listIncidents();
    const orders = store.listOrders();
    res.json({ incidents, orders });
  });

  app.get('/api/incidents/:id', (req, res) => {
    const dossier = store.getIncidentDossier(req.params.id);
    if (!dossier) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    return res.json(dossier);
  });

  app.get('/api/incidents/:id/stream', (req, res) => {
    const { id } = req.params;
    const dossier = store.getIncidentDossier(id);
    if (!dossier) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send({ type: 'dossier_sync', incidentId: id, dossier });

    const unsubscribe = subscribeIncidentStream(id, (event) => {
      send(event);
    });

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  app.post('/api/incidents/:id/investigate', async (req, res) => {
    const { id } = req.params;
    const existing = store.getIncidentDossier(id);
    if (!existing) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const sync = req.query.sync === 'true';
    if (sync) {
      const result = await runWebhookInvestigation(store, id, { stepDelayMs: 0 });
      return res.json(result);
    }

    void runWebhookInvestigation(store, id).catch((err) => {
      console.error(`Investigation failed for ${id}:`, err);
    });

    return res.status(202).json({
      status: 'dispatched',
      incidentId: id,
    });
  });

  app.post('/api/incidents/:id/approve', (req, res) => {
    const { id } = req.params;
    const dossier = store.getIncidentDossier(id);
    if (!dossier) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const operatorName = String(req.body?.operatorName ?? '').trim();
    const operatorRole = String(req.body?.operatorRole ?? 'Lead Payment Reliability Engineer').trim();
    const rationale = String(req.body?.rationale ?? '').trim();

    if (!operatorName || !rationale) {
      return res.status(400).json({
        error: 'Operator name and recovery rationale are required for cryptographic audit seal.',
      });
    }

    const isAttackScenario =
      dossier.incident.failure_class === 'INVALID_SIGNATURE_REPLAY' ||
      dossier.incident.failure_class === 'SUSPICIOUS_BURST' ||
      dossier.order.gateway_status === 'failed';

    const stateBefore = dossier.order.order_status;
    const stateAfter = isAttackScenario ? 'QUARANTINED' : 'RECONCILED';
    const actions = isAttackScenario
      ? [
          `Quarantined order ${dossier.order.order_id} and blocked unverified webhook payload`,
          'Blocked suspicious source IP and flagged webhook secret rotation',
          'Preserved immutable raw payload evidence in SQLite audit store',
        ]
      : [
          `Verified gateway payment ${dossier.order.payment_id} (${dossier.order.gateway_status})`,
          `Promoted merchant order ${dossier.order.order_id} idempotently (${stateBefore} → ${stateAfter})`,
          'Recorded processed X-Razorpay-Event-Id entries to prevent duplicate replay',
        ];

    const decidedAt = new Date().toISOString();
    const seal = generateRecoverySeal(
      id,
      dossier.order.order_id,
      'APPROVED',
      operatorName,
      decidedAt,
    );

    const tx = store.db.transaction(() => {
      store.updateOrderStatus(dossier.order.order_id, stateAfter, 'aureon.recovery.reconciled');
      store.updateIncidentStatus(id, 'CONTAINED');
      store.updateAgentRun(id, 'approval_gate', {
        status: 'COMPLETED',
        summary: `Approved by ${operatorName} (${operatorRole}). Order transitioned ${stateBefore} → ${stateAfter}.`,
        findings_json: JSON.stringify({
          decision: 'APPROVED',
          operatorName,
          operatorRole,
          stateBefore,
          stateAfter,
          seal,
        }),
        completed_at: decidedAt,
      });
      store.insertRecoveryApproval({
        id: `apr-${crypto.randomUUID().slice(0, 8)}`,
        incident_id: id,
        order_id: dossier.order.order_id,
        decision: 'APPROVED',
        operator_name: operatorName,
        operator_role: operatorRole,
        rationale,
        state_before: stateBefore,
        state_after: stateAfter,
        containment_actions_json: JSON.stringify(actions),
        verification_digest: seal,
        decided_at: decidedAt,
      });
    });

    tx();
    return res.json(store.getIncidentDossier(id));
  });

  app.post('/api/incidents/:id/reject', (req, res) => {
    const { id } = req.params;
    const dossier = store.getIncidentDossier(id);
    if (!dossier) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const operatorName = String(req.body?.operatorName ?? '').trim();
    const operatorRole = String(req.body?.operatorRole ?? 'Security Governance Lead').trim();
    const rationale = String(req.body?.rationale ?? '').trim();

    if (!operatorName || !rationale) {
      return res.status(400).json({
        error: 'Operator name and escalation rationale are required.',
      });
    }

    const stateBefore = dossier.order.order_status;
    const stateAfter = 'QUARANTINED';
    const decidedAt = new Date().toISOString();
    const seal = generateRecoverySeal(
      id,
      dossier.order.order_id,
      'REJECTED',
      operatorName,
      decidedAt,
    );

    const tx = store.db.transaction(() => {
      store.updateOrderStatus(dossier.order.order_id, 'QUARANTINED');
      store.updateIncidentStatus(id, 'ESCALATED');
      store.updateAgentRun(id, 'approval_gate', {
        status: 'REJECTED',
        summary: `Escalated & quarantined by ${operatorName}. Order held in QUARANTINED pending manual gateway audit.`,
        findings_json: JSON.stringify({
          decision: 'REJECTED',
          operatorName,
          operatorRole,
          seal,
        }),
        completed_at: decidedAt,
      });
      store.insertRecoveryApproval({
        id: `apr-${crypto.randomUUID().slice(0, 8)}`,
        incident_id: id,
        order_id: dossier.order.order_id,
        decision: 'REJECTED',
        operator_name: operatorName,
        operator_role: operatorRole,
        rationale,
        state_before: stateBefore,
        state_after: stateAfter,
        containment_actions_json: JSON.stringify([
          `Escalated incident ${dossier.incident.code} to manual Payment Operations review`,
          `Locked merchant order ${dossier.order.order_id} in QUARANTINED state`,
        ]),
        verification_digest: seal,
        decided_at: decidedAt,
      });
    });

    tx();
    return res.json(store.getIncidentDossier(id));
  });

  app.post('/api/incidents/simulate', (req, res) => {
    const failureClass = (req.body?.failureClass ?? 'MISSED_WEBHOOK') as FailureClass;
    const amountPaise = Math.max(10_000, Number(req.body?.amountPaise ?? 7_500_000));
    const severity = (req.body?.severity ?? 'CRITICAL') as IncidentSeverity;

    const dossier = store.simulateIncident({
      failureClass,
      amountPaise,
      severity,
    });

    return res.status(201).json(dossier);
  });

  app.post('/api/incidents/reset', (_req, res) => {
    store.resetScenarios();
    return res.json({ status: 'reset', incidents: store.listIncidents() });
  });

  app.post('/api/security/verify-webhook', (req, res) => {
    const rawPayload = String(req.body?.rawPayload ?? '');
    const providedSignature = String(req.body?.providedSignature ?? '');
    const eventId = String(req.body?.eventId ?? 'evt_lab_probe');
    const createdAtUnix = Number(req.body?.createdAtUnix ?? Math.floor(Date.now() / 1000));
    const simulateJsonReparse = Boolean(req.body?.simulateJsonReparse);
    const forceReplayCheck = Boolean(req.body?.forceReplayCheck);
    const customSecret =
      typeof req.body?.customSecret === 'string' && req.body.customSecret.trim()
        ? req.body.customSecret.trim()
        : undefined;

    if (!rawPayload.trim()) {
      return res.status(400).json({ error: 'rawPayload is required.' });
    }

    const effectiveSig =
      providedSignature.trim() || computeWebhookHmac(rawPayload, customSecret);

    const signatureResult = verifyWebhookSignature(rawPayload, effectiveSig, {
      secret: customSecret,
      simulateJsonReparse,
    });

    const processedIds = store.getProcessedEventIds();
    if (forceReplayCheck) {
      processedIds.add(eventId);
    }

    const replayResult = evaluateReplayAndSkew(eventId, createdAtUnix, processedIds);
    const redactionResult = redactWebhookSecrets(rawPayload);

    return res.json({
      signatureResult,
      replayResult,
      redactionResult,
      activeSecretMasked: `${getActiveWebhookSecret().slice(0, 10)}••••••••`,
    });
  });

  app.post('/api/incidents/:id/ai-analyze', async (req, res) => {
    const { id } = req.params;
    const dossier = store.getIncidentDossier(id);
    if (!dossier) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to run live AI forensic synthesis.',
      });
    }

    const question = String(req.body?.question ?? '').trim() ||
      'Diagnose the payment-webhook inconsistency and recommend safe order recovery.';

    const redactedEvidence = redactWebhookSecrets(dossier.incident.evidence_json).redactedText;
    const webhookSummary = dossier.webhookEvents.map((ev) => ({
      eventId: ev.event_id,
      eventType: ev.event_type,
      signatureValid: Boolean(ev.signature_valid),
      replayDetected: Boolean(ev.replay_detected),
      outOfOrder: Boolean(ev.out_of_order),
      httpStatus: ev.http_status_returned,
      retryAttempt: ev.retry_attempt,
      sourceIp: ev.source_ip,
    }));

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Incident: ${dossier.incident.code} (${dossier.incident.failure_class}, severity=${dossier.incident.severity})`,
          `Merchant Order: ${dossier.order.order_id}, Merchant Status=${dossier.order.order_status}, Gateway Status=${dossier.order.gateway_status}, Amount=${dossier.order.amount_paise} paise`,
          `Summary: ${dossier.incident.summary}`,
          `Webhook Deliveries: ${JSON.stringify(webhookSummary)}`,
          `Redacted Evidence: ${redactedEvidence}`,
          `Operator Question: ${question}`,
        ].join('\n'),
        config: {
          systemInstruction:
            'You are a senior payment security and Razorpay webhook reliability engineer. Ground every claim strictly in the provided dossier facts. Never invent keys or metrics.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rootCauseDiagnosis: {
                type: Type.STRING,
                description: 'Clear 2-3 sentence root-cause explanation grounded in the incident data.',
              },
              securityAssessment: {
                type: Type.STRING,
                description: 'Assessment of X-Razorpay-Signature validity, replay indicators, and source IP posture.',
              },
              recommendedRecoverySteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concrete, ordered safe recovery actions.',
              },
              idempotentPatchSnippet: {
                type: Type.STRING,
                description: 'Short, production-ready Express/TypeScript webhook verification or idempotent state-guard snippet.',
              },
            },
            required: [
              'rootCauseDiagnosis',
              'securityAssessment',
              'recommendedRecoverySteps',
              'idempotentPatchSnippet',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        rootCauseDiagnosis: String(parsed.rootCauseDiagnosis ?? ''),
        securityAssessment: String(parsed.securityAssessment ?? ''),
        recommendedRecoverySteps: Array.isArray(parsed.recommendedRecoverySteps)
          ? parsed.recommendedRecoverySteps.map(String)
          : [],
        idempotentPatchSnippet: String(parsed.idempotentPatchSnippet ?? ''),
        modelUsed: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream Gemini request failed.';
      return res.status(502).json({
        error: `Gemini forensic synthesis error: ${message}`,
      });
    }
  });

  app.get('/api/windows-bundle/info', (_req, res) => {
    res.json({
      runtime: 'Windows 10/11 · Python 3.11+ · FastAPI · LangGraph · Ollama (qwen2.5:3b) · SQLite',
      bundleDirectory: 'windows_bundle/',
      ollamaModel: 'qwen2.5:3b',
      commands: {
        ollamaPull: 'ollama pull qwen2.5:3b',
        setupScript: 'windows_bundle\\setup_windows.bat',
        runPowershell: '.\\windows_bundle\\run_windows.ps1',
        runPytest: 'pytest windows_bundle/tests/test_webhook_security.py -v',
      },
    });
  });

  return app;
}

async function startServer() {
  const store = createDatabase();
  const app = createAureonApp(store);
  const port = Number(process.env.PORT ?? 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AUREON control plane listening on http://0.0.0.0:${port}`);
  });
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start AUREON server:', err);
    process.exit(1);
  });
}
