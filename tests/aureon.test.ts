import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../server/db.ts';
import { runWebhookInvestigation } from '../server/orchestrator.ts';
import {
  computeWebhookHmac,
  evaluateOrderStateMachine,
  evaluateReplayAndSkew,
  redactWebhookSecrets,
  verifyWebhookSignature,
} from '../server/security.ts';

test('HMAC-SHA256 raw-body verification detects tampering and JSON re-parse pitfall', () => {
  const rawPayload = JSON.stringify(
    {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test123', amount: 4850000 } } },
    },
    null,
    2,
  );

  const validSig = computeWebhookHmac(rawPayload);

  const rawCheck = verifyWebhookSignature(rawPayload, validSig);
  assert.equal(rawCheck.valid, true);
  assert.equal(rawCheck.reparsedMismatchDetected, false);

  // Classic middleware pitfall: express.json() alters formatting before HMAC check
  const reparsedCheck = verifyWebhookSignature(rawPayload, validSig, {
    simulateJsonReparse: true,
  });
  assert.equal(reparsedCheck.valid, false);
  assert.equal(reparsedCheck.reparsedMismatchDetected, true);

  // Forged signature rejection
  const forgedCheck = verifyWebhookSignature(rawPayload, '0'.repeat(64));
  assert.equal(forgedCheck.valid, false);
});

test('Replay detection and timestamp skew guard reject reused event IDs and stale timestamps', () => {
  const now = 1_760_000_000;
  const processed = new Set(['evt_already_handled']);

  const replayRes = evaluateReplayAndSkew('evt_already_handled', now - 10, processed, now, 300);
  assert.equal(replayRes.replayDetected, true);
  assert.equal(replayRes.staleTimestamp, false);

  const staleRes = evaluateReplayAndSkew('evt_fresh_id', now - 900, processed, now, 300);
  assert.equal(staleRes.replayDetected, false);
  assert.equal(staleRes.staleTimestamp, true);

  const cleanRes = evaluateReplayAndSkew('evt_brand_new', now - 20, processed, now, 300);
  assert.equal(cleanRes.replayDetected, false);
  assert.equal(cleanRes.staleTimestamp, false);
});

test('Out-of-order state machine guard prevents regressions and catches missed captures', () => {
  const missedCheck = evaluateOrderStateMachine({
    currentOrderStatus: 'PENDING',
    gatewayStatus: 'captured',
    lastEventUnix: 1000,
    incomingEventType: 'payment.captured',
    incomingEventUnix: 1050,
    incomingAmountPaise: 4850000,
    orderAmountPaise: 4850000,
  });
  assert.equal(missedCheck.consistent, false);
  assert.equal(missedCheck.recommendedOrderStatus, 'RECONCILED');

  const outOfOrderCheck = evaluateOrderStateMachine({
    currentOrderStatus: 'PAID',
    gatewayStatus: 'captured',
    lastEventUnix: 2000,
    incomingEventType: 'payment.authorized',
    incomingEventUnix: 1800,
    incomingAmountPaise: 4850000,
    orderAmountPaise: 4850000,
  });
  assert.equal(outOfOrderCheck.outOfOrder, true);
});

test('Secret and VPA redaction strips sensitive webhook secrets and customer identifiers', () => {
  const sample =
    'secret=whsec_994812abc key=rzp_live_12345678 vpa=arjun.mehta@okicici email=arjun@example.com';
  const res = redactWebhookSecrets(sample);
  assert.equal(res.redactionCount, 4);
  assert.ok(!res.redactedText.includes('whsec_994812abc'));
  assert.ok(!res.redactedText.includes('rzp_live_12345678'));
  assert.ok(!res.redactedText.includes('arjun.mehta@okicici'));
});

test('SQLite store + multi-agent investigation pauses at human approval gate and simulates fault injection', async () => {
  const store = createDatabase(':memory:');
  try {
    const incidents = store.listIncidents();
    assert.equal(incidents.length, 3);

    const dossier = await runWebhookInvestigation(store, 'inc-wh-01', { stepDelayMs: 0 });
    assert.equal(dossier.incident.status, 'AWAITING_APPROVAL');
    assert.equal(dossier.agentRuns[0].status, 'VERIFIED');
    assert.equal(dossier.agentRuns[4].status, 'PAUSED');

    const sim = store.simulateIncident({
      failureClass: 'INVALID_SIGNATURE_REPLAY',
      amountPaise: 1_500_000,
      severity: 'CRITICAL',
    });
    assert.equal(sim.incident.failure_class, 'INVALID_SIGNATURE_REPLAY');
    assert.equal(store.listIncidents().length, 4);
  } finally {
    store.close();
  }
});
