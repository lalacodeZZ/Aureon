import { useEffect, useState } from 'react';
import { verifyWebhookSecurityLab } from '../api';
import type { WebhookEventItem, WebhookSecurityAuditResponse } from '../types';

interface SecurityVerificationLabProps {
  selectedWebhook: WebhookEventItem | null;
}

export function SecurityVerificationLab({ selectedWebhook }: SecurityVerificationLabProps) {
  const [rawPayload, setRawPayload] = useState('');
  const [providedSignature, setProvidedSignature] = useState('');
  const [eventId, setEventId] = useState('evt_90412_cap_02');
  const [createdAtUnix, setCreatedAtUnix] = useState<number>(Math.floor(Date.now() / 1000));
  const [simulateJsonReparse, setSimulateJsonReparse] = useState(false);
  const [forceReplayCheck, setForceReplayCheck] = useState(false);
  const [result, setResult] = useState<WebhookSecurityAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWebhook) {
      setRawPayload(selectedWebhook.raw_payload);
      setProvidedSignature(selectedWebhook.received_signature);
      setEventId(selectedWebhook.event_id);
      setCreatedAtUnix(selectedWebhook.created_at_unix);
      setForceReplayCheck(selectedWebhook.replay_detected === 1);
      setSimulateJsonReparse(false);
    }
  }, [selectedWebhook]);

  async function runVerification() {
    if (!rawPayload.trim()) {
      setError('Enter or load a raw webhook JSON payload to verify.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await verifyWebhookSecurityLab({
        rawPayload,
        providedSignature,
        eventId,
        createdAtUnix,
        simulateJsonReparse,
        forceReplayCheck,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#262626] bg-[#0d0d0d] p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
            Deterministic Cryptography · Timing-Safe Verification
          </div>
          <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
            Razorpay Signature, Replay &amp; Secret Redaction Lab
          </h3>
        </div>
        <button
          type="button"
          onClick={runVerification}
          disabled={loading}
          className="btn-aureon-pill"
        >
          {loading ? 'Verifying...' : 'Run Security Audit'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-6">
          <div>
            <label
              htmlFor="lab-event-id"
              className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
            >
              X-Razorpay-Event-Id
            </label>
            <input
              id="lab-event-id"
              type="text"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="input-aureon font-machined !text-[13px]"
            />
          </div>

          <div>
            <label
              htmlFor="lab-signature"
              className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
            >
              X-Razorpay-Signature (HMAC-SHA256 Hex)
            </label>
            <input
              id="lab-signature"
              type="text"
              value={providedSignature}
              onChange={(e) => setProvidedSignature(e.target.value)}
              placeholder="Leave blank to compute canonical digest, or paste tampered hex"
              className="input-aureon font-machined !text-[12px]"
            />
          </div>

          <div>
            <label
              htmlFor="lab-payload"
              className="font-machined mb-2 block text-[10px] tracking-[2px] uppercase text-[#999999]"
            >
              Raw Unparsed Webhook Body
            </label>
            <textarea
              id="lab-payload"
              rows={6}
              value={rawPayload}
              onChange={(e) => setRawPayload(e.target.value)}
              className="w-full border border-[#3a3a3a] bg-black p-3 font-machined text-[11px] leading-relaxed text-[#cccccc] focus:border-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex cursor-pointer items-center gap-2.5 font-machined text-[11px] tracking-[1.5px] uppercase text-[#cccccc]">
              <input
                type="checkbox"
                checked={simulateJsonReparse}
                onChange={(e) => setSimulateJsonReparse(e.target.checked)}
                className="h-4 w-4 accent-white"
              />
              Simulate JSON.parse Re-Serialization Pitfall
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 font-machined text-[11px] tracking-[1.5px] uppercase text-[#cccccc]">
              <input
                type="checkbox"
                checked={forceReplayCheck}
                onChange={(e) => setForceReplayCheck(e.target.checked)}
                className="h-4 w-4 accent-white"
              />
              Test Replay Against Processed Events
            </label>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-6">
          {error && (
            <div className="border border-[#cf524c] bg-[#141414] p-4 font-machined text-[12px] text-[#cf524c]">
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              <div className="border border-[#262626] bg-[#141414] p-5">
                <div className="flex items-center justify-between">
                  <span className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                    HMAC-SHA256 Raw-Body Check
                  </span>
                  <span
                    className={`font-machined text-[11px] tracking-[2px] uppercase ${
                      result.signatureResult.valid ? 'text-[#5fa657]' : 'text-[#cf524c]'
                    }`}
                  >
                    {result.signatureResult.valid ? 'VERIFIED' : 'REJECTED'}
                  </span>
                </div>
                <p className="font-editorial mt-2 text-[15px] text-[#cccccc]">
                  {result.signatureResult.reason}
                </p>
                <div className="font-machined mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#999999]">
                  <div>Provided: {result.signatureResult.providedPrefix}…</div>
                  <div>Expected: {result.signatureResult.expectedPrefix}…</div>
                  <div>Bytes: {result.signatureResult.rawByteLength}</div>
                  <div>Secret: {result.activeSecretMasked}</div>
                </div>
              </div>

              <div className="border border-[#262626] bg-[#141414] p-5">
                <div className="flex items-center justify-between">
                  <span className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                    Replay &amp; Timestamp Skew Guard
                  </span>
                  <span
                    className={`font-machined text-[11px] tracking-[2px] uppercase ${
                      result.replayResult.replayDetected || result.replayResult.staleTimestamp
                        ? 'text-[#d4a017]'
                        : 'text-[#5fa657]'
                    }`}
                  >
                    {result.replayResult.replayDetected
                      ? 'REPLAY_DETECTED'
                      : result.replayResult.staleTimestamp
                        ? 'STALE_WINDOW'
                        : 'FRESH_UNIQUE'}
                  </span>
                </div>
                <p className="font-editorial mt-2 text-[15px] text-[#cccccc]">
                  {result.replayResult.reason}
                </p>
              </div>

              <div className="border border-[#262626] bg-[#141414] p-5">
                <div className="flex items-center justify-between">
                  <span className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                    PII &amp; Secret Sanitizer
                  </span>
                  <span className="font-machined text-[11px] tracking-[2px] uppercase text-[#c3d9f3]">
                    {result.redactionResult.redactionCount} Redacted
                  </span>
                </div>
                <pre className="mt-2 max-h-[110px] overflow-auto bg-black p-3 font-machined text-[10px] text-[#999999]">
                  {result.redactionResult.redactedText}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center border border-[#262626] bg-black p-8 text-center">
              <div className="font-display text-[22px] tracking-[2px] uppercase text-white">
                Cryptographic Verification Ready
              </div>
              <p className="font-editorial mt-2 max-w-md text-[15px] text-[#999999]">
                Select any webhook row above or toggle the JSON re-serialization pitfall, then run the live timing-safe HMAC-SHA256 audit.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
