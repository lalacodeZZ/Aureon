import { EventEmitter } from 'node:events';
import { GoogleGenAI } from '@google/genai';
import type { AureonDatabase } from './db.ts';
import {
  detectSuspiciousWebhookActivity,
  evaluateOrderStateMachine,
  evaluateReplayAndSkew,
  redactWebhookSecrets,
  verifyWebhookSignature,
} from './security.ts';
import type { AgentStageId, IncidentDossier } from './types.ts';

export interface OrchestratorEvent {
  type: 'stage_update' | 'dossier_sync' | 'completed' | 'error';
  incidentId: string;
  stageId?: AgentStageId;
  dossier?: IncidentDossier;
  message?: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(50);

const activeRuns = new Set<string>();

export function subscribeIncidentStream(
  incidentId: string,
  listener: (event: OrchestratorEvent) => void,
): () => void {
  const channel = `incident:${incidentId}`;
  bus.on(channel, listener);
  return () => {
    bus.off(channel, listener);
  };
}

function emitEvent(incidentId: string, event: OrchestratorEvent) {
  bus.emit(`incident:${incidentId}`, event);
}

function pauseMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeRecoveryBriefWithGemini(params: {
  dossier: IncidentDossier;
  hmacAllValid: boolean;
  replayCount: number;
  outOfOrderCount: number;
  recommendedOrderStatus: string;
}): Promise<{ text: string; engine: 'gemini-4-hydrogen' | 'deterministic-forensics' }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const isAttack = !params.hmacAllValid;
    return {
      engine: 'deterministic-forensics',
      text: isAttack
        ? `Deterministic Forensic Brief: Webhook payload(s) for ${params.dossier.order.order_id} failed X-Razorpay-Signature HMAC-SHA256 verification and exhibited ${params.replayCount} replay indicator(s). Authoritative gateway state is ${params.dossier.order.gateway_status}. Recommended action: QUARANTINE order and block offending source IP.`
        : `Deterministic Forensic Brief: Gateway payment ${params.dossier.order.payment_id} confirmed ${params.dossier.order.gateway_status} for INR ${(params.dossier.order.amount_paise / 100).toLocaleString('en-IN')}, while merchant order ${params.dossier.order.order_id} remained ${params.dossier.order.order_status} due to ${params.outOfOrderCount > 0 ? 'out-of-order/duplicate race' : '5xx delivery timeouts'}. Recommended action: safe idempotent promotion to ${params.recommendedOrderStatus}.`,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = [
      'You are an institutional payment webhook security investigator.',
      `Incident: ${params.dossier.incident.code} (${params.dossier.incident.failure_class})`,
      `Order: ${params.dossier.order.order_id}, Merchant Status: ${params.dossier.order.order_status}, Gateway Status: ${params.dossier.order.gateway_status}`,
      `Verified Cryptographic Facts: allHmacValid=${params.hmacAllValid}, replayCount=${params.replayCount}, outOfOrderCount=${params.outOfOrderCount}, recommendedOrderStatus=${params.recommendedOrderStatus}`,
      'Write a concise 2-sentence forensic recovery recommendation in plain professional English referencing these verified facts.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Be concise, factual, and strictly grounded in the provided cryptographic metrics. Never invent numbers or keys.',
      },
    });

    const output = response.text?.trim();
    if (output) {
      return { engine: 'gemini-4-hydrogen', text: output };
    }
  } catch (err) {
    console.warn('Gemini synthesis unavailable, falling back to deterministic brief:', err);
  }

  return {
    engine: 'deterministic-forensics',
    text: `Deterministic Forensic Brief: ${params.dossier.order.order_id} shows gateway=${params.dossier.order.gateway_status} vs merchant=${params.dossier.order.order_status} (HMAC valid=${params.hmacAllValid}, replays=${params.replayCount}). Recommend ${params.recommendedOrderStatus} pending operator approval.`,
  };
}

export async function runWebhookInvestigation(
  store: AureonDatabase,
  incidentId: string,
  options?: { stepDelayMs?: number },
): Promise<IncidentDossier> {
  const stepDelay = options?.stepDelayMs ?? 360;
  const initial = store.getIncidentDossier(incidentId);
  if (!initial) {
    throw new Error(`Incident ${incidentId} not found.`);
  }
  if (activeRuns.has(incidentId)) {
    return initial;
  }

  activeRuns.add(incidentId);

  try {
    store.resetAgentRuns(incidentId);
    store.updateIncidentStatus(incidentId, 'INVESTIGATING');
    emitEvent(incidentId, {
      type: 'dossier_sync',
      incidentId,
      dossier: store.getIncidentDossier(incidentId)!,
    });

    // Stage 0: Order & Gateway Reconciler
    const t0 = Date.now();
    store.updateAgentRun(incidentId, 'reconciler', {
      status: 'EXECUTING',
      summary: 'Comparing authoritative Razorpay payment capture state against SQLite merchant_orders.',
      started_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'reconciler',
      dossier: store.getIncidentDossier(incidentId)!,
    });
    await pauseMs(stepDelay);

    const latest = store.getIncidentDossier(incidentId)!;
    const { order, webhookEvents } = latest;
    const discrepancyExists =
      (order.gateway_status === 'captured' && order.order_status === 'PENDING') ||
      order.gateway_status === 'failed';

    store.updateAgentRun(incidentId, 'reconciler', {
      status: 'VERIFIED',
      summary: `Reconciled ${order.order_id}: gateway=${order.gateway_status}, merchant=${order.order_status}, webhook_deliveries=${webhookEvents.length}.`,
      findings_json: JSON.stringify({
        orderId: order.order_id,
        gatewayPaymentId: order.payment_id,
        gatewayStatus: order.gateway_status,
        merchantOrderStatus: order.order_status,
        amountInr: order.amount_paise / 100,
        discrepancyExists,
      }),
      duration_ms: Date.now() - t0,
      completed_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'reconciler',
      dossier: store.getIncidentDossier(incidentId)!,
    });

    // Stage 1: Signature & Replay Forensics
    const t1 = Date.now();
    store.updateAgentRun(incidentId, 'crypto_forensics', {
      status: 'EXECUTING',
      summary: 'Executing HMAC-SHA256 raw-body signature verification, replay-window checks, and secret redaction.',
      started_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'crypto_forensics',
      dossier: store.getIncidentDossier(incidentId)!,
    });
    await pauseMs(stepDelay);

    const processedIds = store.getProcessedEventIds();
    const signatureChecks = webhookEvents.map((ev) => {
      const sigResult = verifyWebhookSignature(ev.raw_payload, ev.received_signature);
      const replayResult = evaluateReplayAndSkew(ev.event_id, ev.created_at_unix, processedIds);
      return {
        eventId: ev.event_id,
        eventType: ev.event_type,
        signatureValid: sigResult.valid,
        providedPrefix: sigResult.providedPrefix,
        expectedPrefix: sigResult.expectedPrefix,
        replayDetected: ev.replay_detected === 1 || replayResult.replayDetected,
        skewSeconds: replayResult.skewSeconds,
        sourceIp: ev.source_ip,
      };
    });

    const suspiciousReport = detectSuspiciousWebhookActivity(webhookEvents);
    const hmacAllValid = signatureChecks.every((c) => c.signatureValid);
    const redactedPreview = redactWebhookSecrets(
      JSON.stringify(latest.incident.evidence_json),
    );

    store.updateAgentRun(incidentId, 'crypto_forensics', {
      status: 'VERIFIED',
      summary: `HMAC-SHA256 valid=${hmacAllValid} (${signatureChecks.filter((c) => !c.signatureValid).length} invalid), replays=${suspiciousReport.replayCount}, riskTier=${suspiciousReport.riskTier}.`,
      findings_json: JSON.stringify({
        hmacAllValid,
        signatureChecks,
        suspiciousReport,
        redactedEvidenceCount: redactedPreview.redactionCount,
      }),
      duration_ms: Date.now() - t1,
      completed_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'crypto_forensics',
      dossier: store.getIncidentDossier(incidentId)!,
    });

    // Stage 2: Ordering & Idempotency Guard
    const t2 = Date.now();
    store.updateAgentRun(incidentId, 'ordering_guard', {
      status: 'EXECUTING',
      summary: 'Evaluating monotonic event timestamps, out-of-order regressions, and 5xx retry backoff logs.',
      started_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'ordering_guard',
      dossier: store.getIncidentDossier(incidentId)!,
    });
    await pauseMs(stepDelay);

    const lastEv = webhookEvents[webhookEvents.length - 1];
    const orderGuard = evaluateOrderStateMachine({
      currentOrderStatus: order.order_status,
      gatewayStatus: order.gateway_status,
      lastEventUnix: order.last_event_unix,
      incomingEventType: lastEv?.event_type ?? 'payment.captured',
      incomingEventUnix: lastEv?.created_at_unix ?? order.last_event_unix,
      incomingAmountPaise: lastEv?.amount_paise ?? order.amount_paise,
      orderAmountPaise: order.amount_paise,
    });

    const outOfOrderCount = webhookEvents.filter((w) => w.out_of_order === 1).length;
    const failed5xxCount = webhookEvents.filter((w) => w.http_status_returned >= 500).length;

    store.updateAgentRun(incidentId, 'ordering_guard', {
      status: 'VERIFIED',
      summary: `Out-of-order events=${outOfOrderCount}, 5xx retries=${failed5xxCount}. Recommended target order state: ${orderGuard.recommendedOrderStatus}.`,
      findings_json: JSON.stringify({
        outOfOrderCount,
        failed5xxCount,
        orderGuard,
      }),
      duration_ms: Date.now() - t2,
      completed_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'ordering_guard',
      dossier: store.getIncidentDossier(incidentId)!,
    });

    // Stage 3: Safe Recovery Planner
    const t3 = Date.now();
    store.updateAgentRun(incidentId, 'recovery_planner', {
      status: 'EXECUTING',
      summary: 'Synthesizing idempotent recovery plan and verification brief.',
      started_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'recovery_planner',
      dossier: store.getIncidentDossier(incidentId)!,
    });
    await pauseMs(stepDelay);

    const brief = await synthesizeRecoveryBriefWithGemini({
      dossier: latest,
      hmacAllValid,
      replayCount: suspiciousReport.replayCount,
      outOfOrderCount,
      recommendedOrderStatus: hmacAllValid ? orderGuard.recommendedOrderStatus : 'QUARANTINED',
    });

    store.updateAgentRun(incidentId, 'recovery_planner', {
      status: 'VERIFIED',
      summary: brief.text,
      findings_json: JSON.stringify({
        synthesisEngine: brief.engine,
        proposedOrderStatus: hmacAllValid ? orderGuard.recommendedOrderStatus : 'QUARANTINED',
        brief: brief.text,
      }),
      duration_ms: Date.now() - t3,
      completed_at: new Date().toISOString(),
    });
    emitEvent(incidentId, {
      type: 'stage_update',
      incidentId,
      stageId: 'recovery_planner',
      dossier: store.getIncidentDossier(incidentId)!,
    });

    // Stage 4: Pause at Human Governance Gate
    store.updateAgentRun(incidentId, 'approval_gate', {
      status: 'PAUSED',
      summary: `Awaiting operator sign-off before mutating ${order.order_id} (${order.order_status} → ${hmacAllValid ? orderGuard.recommendedOrderStatus : 'QUARANTINED'}).`,
      findings_json: JSON.stringify({
        awaitingHumanApproval: true,
        targetOrder: order.order_id,
        proposedState: hmacAllValid ? orderGuard.recommendedOrderStatus : 'QUARANTINED',
      }),
      started_at: new Date().toISOString(),
    });
    store.updateIncidentStatus(incidentId, 'AWAITING_APPROVAL');

    const finalDossier = store.getIncidentDossier(incidentId)!;
    emitEvent(incidentId, {
      type: 'completed',
      incidentId,
      stageId: 'approval_gate',
      dossier: finalDossier,
    });
    return finalDossier;
  } catch (err) {
    emitEvent(incidentId, {
      type: 'error',
      incidentId,
      message: err instanceof Error ? err.message : 'Investigation execution failed.',
    });
    throw err;
  } finally {
    activeRuns.delete(incidentId);
  }
}
