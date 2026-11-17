import type {
  AiForensicAnalysisResponse,
  FailureClass,
  IncidentDossier,
  IncidentItem,
  IncidentSeverity,
  MerchantOrder,
  WebhookSecurityAuditResponse,
} from './types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') {
        message = data.error;
      }
    } catch {
      // Ignore parse error
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchIncidents() {
  return requestJson<{ incidents: IncidentItem[]; orders: MerchantOrder[] }>('/api/incidents');
}

export function fetchIncidentDossier(incidentId: string) {
  return requestJson<IncidentDossier>(`/api/incidents/${encodeURIComponent(incidentId)}`);
}

export function dispatchInvestigation(incidentId: string) {
  return requestJson<{ status: string; incidentId: string }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/investigate`,
    { method: 'POST' },
  );
}

export function approveIncidentRecovery(
  incidentId: string,
  payload: { operatorName: string; operatorRole: string; rationale: string },
) {
  return requestJson<IncidentDossier>(
    `/api/incidents/${encodeURIComponent(incidentId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function rejectIncidentRecovery(
  incidentId: string,
  payload: { operatorName: string; operatorRole: string; rationale: string },
) {
  return requestJson<IncidentDossier>(
    `/api/incidents/${encodeURIComponent(incidentId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function simulateWebhookIncident(payload: {
  failureClass: FailureClass;
  amountPaise: number;
  severity: IncidentSeverity;
}) {
  return requestJson<IncidentDossier>('/api/incidents/simulate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetAllScenarios() {
  return requestJson<{ status: string; incidents: IncidentItem[] }>('/api/incidents/reset', {
    method: 'POST',
  });
}

export function verifyWebhookSecurityLab(payload: {
  rawPayload: string;
  providedSignature: string;
  eventId: string;
  createdAtUnix: number;
  simulateJsonReparse: boolean;
  forceReplayCheck: boolean;
  customSecret?: string;
}) {
  return requestJson<WebhookSecurityAuditResponse>('/api/security/verify-webhook', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function analyzeIncidentWithAi(incidentId: string, question?: string) {
  return requestJson<AiForensicAnalysisResponse>(
    `/api/incidents/${encodeURIComponent(incidentId)}/ai-analyze`,
    {
      method: 'POST',
      body: JSON.stringify({ question: question ?? '' }),
    },
  );
}
