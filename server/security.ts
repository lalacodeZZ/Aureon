import crypto from 'node:crypto';
import type { GatewayStatus, OrderStatus, WebhookEventRecord } from './types.ts';

const DEFAULT_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_aureon_sandbox_9948271a';

export function getActiveWebhookSecret(): string {
  return DEFAULT_WEBHOOK_SECRET;
}

export function computeWebhookHmac(rawPayload: string | Buffer, secret?: string): string {
  const key = secret && secret.trim() ? secret.trim() : DEFAULT_WEBHOOK_SECRET;
  return crypto.createHmac('sha256', key).update(rawPayload).digest('hex');
}

export interface SignatureVerificationResult {
  valid: boolean;
  algorithm: 'HMAC-SHA256';
  rawByteLength: number;
  reparsedMismatchDetected: boolean;
  providedPrefix: string;
  expectedPrefix: string;
  expectedFullHex: string;
  reason: string;
}

/**
 * Verifies X-Razorpay-Signature using timingSafeEqual over the RAW unparsed payload.
 * Optionally simulates the classic Express body-parser pitfall where JSON.parse + JSON.stringify
 * alters whitespace/key ordering and causes valid webhooks to fail signature verification.
 */
export function verifyWebhookSignature(
  rawPayload: string,
  providedSignature: string,
  options?: { secret?: string; simulateJsonReparse?: boolean },
): SignatureVerificationResult {
  const secret = options?.secret;
  const expectedRawHex = computeWebhookHmac(rawPayload, secret);

  let payloadEvaluated = rawPayload;
  let reparsedMismatchDetected = false;

  if (options?.simulateJsonReparse) {
    try {
      const parsed = JSON.parse(rawPayload);
      const reparsed = JSON.stringify(parsed);
      if (reparsed !== rawPayload) {
        payloadEvaluated = reparsed;
        reparsedMismatchDetected = true;
      }
    } catch {
      // Keep raw payload if invalid JSON
    }
  }

  const evaluatedHex = computeWebhookHmac(payloadEvaluated, secret);
  const normalized = providedSignature.trim().toLowerCase();

  let valid = false;
  if (/^[0-9a-f]{64}$/.test(normalized)) {
    const providedBuf = Buffer.from(normalized, 'hex');
    const evaluatedBuf = Buffer.from(evaluatedHex, 'hex');
    valid =
      providedBuf.length === evaluatedBuf.length &&
      crypto.timingSafeEqual(providedBuf, evaluatedBuf);
  }

  let reason =
    'X-Razorpay-Signature matches HMAC-SHA256 digest computed over raw unparsed request body.';
  if (!valid) {
    if (reparsedMismatchDetected && normalized === expectedRawHex) {
      reason =
        'Signature mismatch caused by JSON middleware re-serialization altering whitespace/key order before HMAC verification.';
    } else {
      reason =
        'Invalid X-Razorpay-Signature — payload tampering, forged webhook origin, or rotated webhook secret.';
    }
  }

  return {
    valid,
    algorithm: 'HMAC-SHA256',
    rawByteLength: Buffer.byteLength(rawPayload, 'utf8'),
    reparsedMismatchDetected,
    providedPrefix: normalized ? normalized.slice(0, 16) : 'empty',
    expectedPrefix: expectedRawHex.slice(0, 16),
    expectedFullHex: expectedRawHex,
    reason,
  };
}

export interface ReplayCheckResult {
  replayDetected: boolean;
  staleTimestamp: boolean;
  skewSeconds: number;
  toleranceSeconds: number;
  reason: string;
}

export function evaluateReplayAndSkew(
  eventId: string,
  createdAtUnix: number,
  processedEventIds: Set<string>,
  nowUnix: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): ReplayCheckResult {
  const replayDetected = processedEventIds.has(eventId);
  const skewSeconds = Math.abs(nowUnix - createdAtUnix);
  const staleTimestamp = skewSeconds > toleranceSeconds;

  let reason = 'Event ID is unique and timestamp falls within replay tolerance window.';
  if (replayDetected && staleTimestamp) {
    reason = `Replay attack indicator: duplicate X-Razorpay-Event-Id (${eventId}) with ${skewSeconds}s timestamp skew.`;
  } else if (replayDetected) {
    reason = `Duplicate delivery / replay detected for X-Razorpay-Event-Id (${eventId}); idempotency guard blocked re-execution.`;
  } else if (staleTimestamp) {
    reason = `Stale webhook timestamp (${skewSeconds}s skew exceeds ${toleranceSeconds}s replay window).`;
  }

  return {
    replayDetected,
    staleTimestamp,
    skewSeconds,
    toleranceSeconds,
    reason,
  };
}

export interface OrderStateGuardResult {
  consistent: boolean;
  outOfOrder: boolean;
  amountMismatch: boolean;
  recommendedOrderStatus: OrderStatus;
  reason: string;
}

const EVENT_PRECEDENCE: Record<string, number> = {
  'payment.failed': 1,
  'payment.authorized': 2,
  'payment.captured': 3,
  'order.paid': 4,
};

export function evaluateOrderStateMachine(params: {
  currentOrderStatus: OrderStatus;
  gatewayStatus: GatewayStatus;
  lastEventUnix: number;
  incomingEventType: string;
  incomingEventUnix: number;
  incomingAmountPaise: number;
  orderAmountPaise: number;
}): OrderStateGuardResult {
  const amountMismatch = params.incomingAmountPaise !== params.orderAmountPaise;
  const outOfOrder =
    params.incomingEventUnix < params.lastEventUnix ||
    (params.currentOrderStatus === 'PAID' &&
      (EVENT_PRECEDENCE[params.incomingEventType] ?? 0) < EVENT_PRECEDENCE['payment.captured']);

  const inconsistent =
    (params.gatewayStatus === 'captured' && params.currentOrderStatus === 'PENDING') ||
    amountMismatch ||
    outOfOrder;

  let recommendedOrderStatus: OrderStatus = params.currentOrderStatus;
  if (amountMismatch) {
    recommendedOrderStatus = 'QUARANTINED';
  } else if (params.gatewayStatus === 'captured' && params.currentOrderStatus === 'PENDING') {
    recommendedOrderStatus = 'RECONCILED';
  } else if (params.gatewayStatus === 'failed' && params.currentOrderStatus === 'PENDING') {
    recommendedOrderStatus = 'QUARANTINED';
  }

  let reason = 'Merchant order state aligns with authoritative gateway status.';
  if (amountMismatch) {
    reason = `Amount mismatch: webhook reported ${params.incomingAmountPaise} paise vs merchant order ${params.orderAmountPaise} paise.`;
  } else if (params.gatewayStatus === 'captured' && params.currentOrderStatus === 'PENDING') {
    reason =
      'Payment succeeded on Razorpay (captured) while merchant order remains PENDING due to missed or failed webhook processing.';
  } else if (outOfOrder) {
    reason = `Out-of-order delivery: ${params.incomingEventType} arrived after newer state timestamp (${params.lastEventUnix}).`;
  }

  return {
    consistent: !inconsistent,
    outOfOrder,
    amountMismatch,
    recommendedOrderStatus,
    reason,
  };
}

export interface SuspiciousActivityReport {
  riskTier: 'NOMINAL' | 'ELEVATED' | 'CRITICAL';
  invalidSignatureCount: number;
  replayCount: number;
  failed5xxCount: number;
  uniqueSourceIps: string[];
  findings: string[];
}

export function detectSuspiciousWebhookActivity(
  events: WebhookEventRecord[],
): SuspiciousActivityReport {
  let invalidSignatureCount = 0;
  let replayCount = 0;
  let failed5xxCount = 0;
  const ipSet = new Set<string>();

  for (const ev of events) {
    if (!ev.signature_valid) invalidSignatureCount += 1;
    if (ev.replay_detected) replayCount += 1;
    if (ev.http_status_returned >= 500 || ev.http_status_returned === 408) failed5xxCount += 1;
    ipSet.add(ev.source_ip);
  }

  const findings: string[] = [];
  if (invalidSignatureCount > 0) {
    findings.push(`${invalidSignatureCount} webhook delivery(s) failed HMAC-SHA256 signature verification.`);
  }
  if (replayCount > 0) {
    findings.push(`${replayCount} duplicate or replayed X-Razorpay-Event-Id delivery(s) intercepted.`);
  }
  if (failed5xxCount > 0) {
    findings.push(`${failed5xxCount} merchant endpoint timeout/5xx response(s) triggered gateway retry backoff.`);
  }
  if (ipSet.size > 1) {
    findings.push(`Events originated from ${ipSet.size} distinct source IPs (${Array.from(ipSet).join(', ')}).`);
  }

  const riskScore = invalidSignatureCount * 2 + replayCount * 2 + failed5xxCount;
  const riskTier = riskScore >= 3 ? 'CRITICAL' : riskScore >= 1 ? 'ELEVATED' : 'NOMINAL';

  return {
    riskTier,
    invalidSignatureCount,
    replayCount,
    failed5xxCount,
    uniqueSourceIps: Array.from(ipSet),
    findings,
  };
}

export interface RedactionResult {
  redactedText: string;
  redactionCount: number;
  matchedCategories: string[];
}

export function redactWebhookSecrets(rawText: string): RedactionResult {
  let redacted = rawText;
  let count = 0;
  const categories = new Set<string>();

  const rules: Array<{ label: string; regex: RegExp; replacement: string }> = [
    {
      label: 'WEBHOOK_SECRET',
      regex: /\bwhsec_[A-Za-z0-9_\-]{6,}\b/g,
      replacement: '[REDACTED_WEBHOOK_SECRET]',
    },
    {
      label: 'RAZORPAY_API_KEY',
      regex: /\brzp_(?:live|test)_[A-Za-z0-9_\-]{6,}\b/g,
      replacement: '[REDACTED_RAZORPAY_KEY]',
    },
    {
      label: 'BEARER_TOKEN',
      regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
    },
    {
      label: 'EMAIL_ADDRESS',
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacement: '[REDACTED_EMAIL]',
    },
    {
      label: 'UPI_OR_VPA',
      regex: /\b[a-zA-Z0-9._-]{3,}@(?:okaxis|okicici|oksbi|ybl|paytm|upi)\b/g,
      replacement: '[REDACTED_VPA]',
    },
  ];

  for (const rule of rules) {
    const matches = redacted.match(rule.regex);
    if (matches && matches.length > 0) {
      count += matches.length;
      categories.add(rule.label);
      redacted = redacted.replace(rule.regex, rule.replacement);
    }
  }

  return {
    redactedText: redacted,
    redactionCount: count,
    matchedCategories: Array.from(categories),
  };
}

export function generateRecoverySeal(
  incidentId: string,
  orderId: string,
  decision: string,
  operatorName: string,
  timestamp: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${incidentId}|${orderId}|${decision}|${operatorName}|${timestamp}|AUREON_WEBHOOK_SEAL`)
    .digest('hex');
}
