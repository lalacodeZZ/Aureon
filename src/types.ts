export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export type IncidentStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'AWAITING_APPROVAL'
  | 'CONTAINED'
  | 'ESCALATED';

export type FailureClass =
  | 'MISSED_WEBHOOK'
  | 'DUPLICATE_OUT_OF_ORDER'
  | 'INVALID_SIGNATURE_REPLAY'
  | 'SUSPICIOUS_BURST';

export type AgentStageId =
  | 'reconciler'
  | 'crypto_forensics'
  | 'ordering_guard'
  | 'recovery_planner'
  | 'approval_gate';

export type AgentRunStatus =
  | 'QUEUED'
  | 'EXECUTING'
  | 'VERIFIED'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED';

export interface TelemetryPoint {
  timestamp: string;
  verifiedCaptures: number;
  retryFailures5xx: number;
  signatureErrors: number;
  deliveryLatencyMs: number;
}

export interface MerchantOrder {
  order_id: string;
  payment_id: string;
  customer_ref: string;
  amount_paise: number;
  currency: string;
  order_status: 'PENDING' | 'PAID' | 'RECONCILED' | 'QUARANTINED';
  gateway_status: 'captured' | 'authorized' | 'failed';
  last_event_type: string;
  last_event_unix: number;
  updated_at: string;
}

export interface WebhookEventItem {
  id: string;
  incident_id: string;
  event_id: string;
  event_type: string;
  order_id: string;
  payment_id: string;
  amount_paise: number;
  raw_payload: string;
  received_signature: string;
  computed_signature: string;
  signature_valid: number;
  replay_detected: number;
  out_of_order: number;
  http_status_returned: number;
  retry_attempt: number;
  source_ip: string;
  delivery_status: 'DELIVERED' | 'FAILED_5XX' | 'REPLAY_BLOCKED' | 'SIG_INVALID';
  created_at_unix: number;
  received_at: string;
}

export interface IncidentItem {
  id: string;
  code: string;
  title: string;
  failure_class: FailureClass;
  severity: IncidentSeverity;
  status: IncidentStatus;
  order_id: string;
  gateway_payment_id: string;
  amount_paise: number;
  currency: string;
  affected_node_id: string;
  summary: string;
  telemetry_json: string;
  evidence_json: string;
  audit_digest: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRunItem {
  id: string;
  incident_id: string;
  stage_index: number;
  stage_id: AgentStageId;
  agent_name: string;
  status: AgentRunStatus;
  summary: string;
  findings_json: string;
  duration_ms: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface RecoveryApprovalItem {
  id: string;
  incident_id: string;
  order_id: string;
  decision: 'APPROVED' | 'REJECTED';
  operator_name: string;
  operator_role: string;
  rationale: string;
  state_before: string;
  state_after: string;
  containment_actions_json: string;
  verification_digest: string;
  decided_at: string;
}

export interface IncidentDossier {
  incident: IncidentItem;
  order: MerchantOrder;
  webhookEvents: WebhookEventItem[];
  agentRuns: AgentRunItem[];
  approvals: RecoveryApprovalItem[];
}

export interface WebhookSecurityAuditResponse {
  signatureResult: {
    valid: boolean;
    algorithm: 'HMAC-SHA256';
    rawByteLength: number;
    reparsedMismatchDetected: boolean;
    providedPrefix: string;
    expectedPrefix: string;
    expectedFullHex: string;
    reason: string;
  };
  replayResult: {
    replayDetected: boolean;
    staleTimestamp: boolean;
    skewSeconds: number;
    toleranceSeconds: number;
    reason: string;
  };
  redactionResult: {
    redactedText: string;
    redactionCount: number;
    matchedCategories: string[];
  };
  activeSecretMasked: string;
}

export interface AiForensicAnalysisResponse {
  rootCauseDiagnosis: string;
  securityAssessment: string;
  recommendedRecoverySteps: string[];
  idempotentPatchSnippet: string;
  modelUsed: string;
  generatedAt: string;
}
