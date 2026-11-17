import { useState } from 'react';
import type { IncidentDossier } from '../types';

interface RecoveryGatePanelProps {
  dossier: IncidentDossier;
  onApprove: (payload: {
    operatorName: string;
    operatorRole: string;
    rationale: string;
  }) => Promise<void>;
  onReject: (payload: {
    operatorName: string;
    operatorRole: string;
    rationale: string;
  }) => Promise<void>;
  submitting: boolean;
}

export function RecoveryGatePanel({
  dossier,
  onApprove,
  onReject,
  submitting,
}: RecoveryGatePanelProps) {
  const [operatorName, setOperatorName] = useState('A. Chaudhary');
  const [operatorRole, setOperatorRole] = useState('Lead Payment Security Engineer');
  const [rationale, setRationale] = useState(
    'Authoritative gateway state and cryptographic verification findings reviewed; execute safe idempotent order recovery.',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const { incident, order, approvals } = dossier;
  const isAttack =
    incident.failure_class === 'INVALID_SIGNATURE_REPLAY' ||
    incident.failure_class === 'SUSPICIOUS_BURST' ||
    order.gateway_status === 'failed';

  const proposedTarget = isAttack ? 'QUARANTINED' : 'RECONCILED';
  const alreadyFinalized = incident.status === 'CONTAINED' || incident.status === 'ESCALATED';

  async function handleAction(kind: 'approve' | 'reject') {
    if (!operatorName.trim() || !rationale.trim()) {
      setFormError('Operator identity and decision rationale are required.');
      return;
    }
    setFormError(null);
    const payload = {
      operatorName: operatorName.trim(),
      operatorRole: operatorRole.trim(),
      rationale: rationale.trim(),
    };
    if (kind === 'approve') {
      await onApprove(payload);
    } else {
      await onReject(payload);
    }
  }

  return (
    <div className="border border-[#262626] bg-[#0d0d0d] p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
            Human-in-the-Loop Governance · Atomic SQLite Transition
          </div>
          <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
            Safe Order Recovery &amp; Quarantine Gate
          </h3>
        </div>
        <span
          className={`font-machined text-[11px] tracking-[2px] uppercase ${
            incident.status === 'CONTAINED'
              ? 'text-[#5fa657]'
              : incident.status === 'AWAITING_APPROVAL'
                ? 'text-[#d4a017]'
                : 'text-[#cccccc]'
          }`}
        >
          Gate Status · {incident.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: Proposed State Diff + Operator Form */}
        <div className="space-y-6 lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 border border-[#262626] bg-[#141414] p-5 sm:grid-cols-3">
            <div>
              <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                Target Order
              </div>
              <div className="font-display mt-1 text-[20px] tracking-[1.5px] uppercase text-white">
                {order.order_id}
              </div>
            </div>
            <div>
              <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                Current State
              </div>
              <div className="font-display mt-1 text-[20px] tracking-[1.5px] uppercase text-[#d4a017]">
                {order.order_status}
              </div>
            </div>
            <div>
              <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                Proposed Safe State
              </div>
              <div
                className={`font-display mt-1 text-[20px] tracking-[1.5px] uppercase ${
                  isAttack ? 'text-[#cf524c]' : 'text-[#5fa657]'
                }`}
              >
                {proposedTarget}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="op-name"
                className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
              >
                Approving Operator
              </label>
              <input
                id="op-name"
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                disabled={alreadyFinalized || submitting}
                className="input-aureon"
              />
            </div>
            <div>
              <label
                htmlFor="op-role"
                className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
              >
                Governance Role
              </label>
              <input
                id="op-role"
                type="text"
                value={operatorRole}
                onChange={(e) => setOperatorRole(e.target.value)}
                disabled={alreadyFinalized || submitting}
                className="input-aureon"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="op-rationale"
              className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
            >
              Audit Rationale
            </label>
            <input
              id="op-rationale"
              type="text"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              disabled={alreadyFinalized || submitting}
              className="input-aureon"
            />
          </div>

          {formError && (
            <p className="font-machined text-[12px] text-[#cf524c]">{formError}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => handleAction('approve')}
              disabled={alreadyFinalized || submitting}
              className="btn-aureon-pill"
            >
              {submitting
                ? 'Sealing...'
                : isAttack
                  ? 'Approve Quarantine & Block'
                  : 'Approve Safe Recovery'}
            </button>
            <button
              type="button"
              onClick={() => handleAction('reject')}
              disabled={alreadyFinalized || submitting}
              className="btn-aureon-secondary"
            >
              Escalate &amp; Hold
            </button>
          </div>
        </div>

        {/* Right: Immutable Audit Trail */}
        <div className="lg:col-span-5">
          <div className="font-machined mb-3 text-[11px] tracking-[2px] uppercase text-[#999999]">
            Immutable SQLite Approval Ledger
          </div>
          {approvals.length === 0 ? (
            <div className="border border-[#262626] bg-black p-6">
              <div className="font-display text-[18px] tracking-[1.5px] uppercase text-[#cccccc]">
                No Operator Sign-Off Recorded Yet
              </div>
              <p className="font-editorial mt-2 text-[15px] text-[#999999]">
                Run the multi-agent investigation above and confirm recovery to commit a SHA-256 sealed audit entry.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((apr) => {
                let actions: string[] = [];
                try {
                  actions = JSON.parse(apr.containment_actions_json);
                } catch {
                  actions = [];
                }
                return (
                  <div key={apr.id} className="border border-[#262626] bg-[#141414] p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-machined text-[11px] tracking-[2px] uppercase text-[#5fa657]">
                        {apr.decision} · {apr.state_before} → {apr.state_after}
                      </span>
                      <span className="font-machined text-[10px] text-[#666666]">
                        {new Date(apr.decided_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-display mt-2 text-[18px] tracking-[1px] uppercase text-white">
                      {apr.operator_name} — {apr.operator_role}
                    </div>
                    <p className="font-editorial mt-1.5 text-[14px] text-[#cccccc]">
                      {apr.rationale}
                    </p>
                    <ul className="mt-3 space-y-1 font-machined text-[11px] text-[#999999]">
                      {actions.map((act) => (
                        <li key={act}>— {act}</li>
                      ))}
                    </ul>
                    <div className="font-machined mt-3 break-all border-t border-[#262626] pt-2 text-[10px] text-[#c3d9f3]">
                      SHA-256 Seal: {apr.verification_digest}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
