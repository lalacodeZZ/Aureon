import { MotionConfig, motion, useReducedMotion, type Variants } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  approveIncidentRecovery,
  dispatchInvestigation,
  fetchIncidentDossier,
  fetchIncidents,
  rejectIncidentRecovery,
  resetAllScenarios,
  simulateWebhookIncident,
} from './api';
import { AgentPipelineFlow } from './components/AgentPipelineFlow';
import { AiForensicAdvisor } from './components/AiForensicAdvisor';
import { BrandEmblem } from './components/BrandEmblem';
import { Navbar } from './components/Navbar';
import { RecoveryGatePanel } from './components/RecoveryGatePanel';
import { SecurityVerificationLab } from './components/SecurityVerificationLab';
import { TelemetryCharts } from './components/TelemetryCharts';
import { WebhookCore3D } from './components/WebhookCore3D';
import { WindowsBundleSection } from './components/WindowsBundleSection';
import type {
  FailureClass,
  IncidentDossier,
  IncidentItem,
  TelemetryPoint,
  WebhookEventItem,
} from './types';

function formatInr(paise: number): string {
  return `INR ${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const luxuryEase = [0.16, 1, 0.3, 1] as const;

const sectionContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.04,
    },
  },
};

const sectionChildVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: luxuryEase,
    },
  },
};

export default function App() {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<IncidentDossier | null>(null);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookEventItem | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-ingress-gateway');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [coreBandImgFailed, setCoreBandImgFailed] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const labRef = useRef<HTMLDivElement>(null);

  const loadIncidentList = useCallback(async (preferredId?: string) => {
    setLoadingList(true);
    setBackendError(null);
    try {
      const data = await fetchIncidents();
      setIncidents(data.incidents);
      const targetId =
        preferredId && data.incidents.some((i) => i.id === preferredId)
          ? preferredId
          : data.incidents[0]?.id ?? null;
      setSelectedIncidentId(targetId);
    } catch (err) {
      setBackendError(
        err instanceof Error
          ? `Backend connection unavailable: ${err.message}`
          : 'Unable to reach AUREON control plane.',
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDossier = useCallback(async (incidentId: string) => {
    setLoadingDossier(true);
    setBackendError(null);
    try {
      const data = await fetchIncidentDossier(incidentId);
      setDossier(data);
      setSelectedNodeId(data.incident.affected_node_id);
      setSelectedWebhook(data.webhookEvents[data.webhookEvents.length - 1] ?? null);
    } catch (err) {
      setBackendError(
        err instanceof Error ? err.message : 'Failed to load incident dossier.',
      );
    } finally {
      setLoadingDossier(false);
    }
  }, []);

  useEffect(() => {
    void loadIncidentList();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [loadIncidentList]);

  useEffect(() => {
    if (selectedIncidentId) {
      void loadDossier(selectedIncidentId);
    } else {
      setDossier(null);
    }
  }, [selectedIncidentId, loadDossier]);

  const handleRunInvestigation = useCallback(async () => {
    if (!selectedIncidentId) return;
    setInvestigating(true);
    setBackendError(null);
    setBannerMessage(null);

    eventSourceRef.current?.close();
    const es = new EventSource(
      `/api/incidents/${encodeURIComponent(selectedIncidentId)}/stream`,
    );
    eventSourceRef.current = es;

    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.dossier) {
          setDossier(parsed.dossier);
          setIncidents((prev) =>
            prev.map((item) =>
              item.id === parsed.dossier.incident.id ? parsed.dossier.incident : item,
            ),
          );
        }
        if (parsed.type === 'completed' || parsed.type === 'error') {
          setInvestigating(false);
          es.close();
          if (parsed.type === 'error') {
            setBackendError(parsed.message ?? 'Investigation interrupted.');
          }
        }
      } catch {
        // Ignore malformed SSE keepalive frames
      }
    };

    es.onerror = () => {
      setInvestigating(false);
      es.close();
    };

    try {
      await dispatchInvestigation(selectedIncidentId);
    } catch (err) {
      setInvestigating(false);
      es.close();
      setBackendError(
        err instanceof Error ? err.message : 'Failed to dispatch multi-agent run.',
      );
    }
  }, [selectedIncidentId]);

  const handleSimulate = useCallback(
    async (failureClass: FailureClass) => {
      setSimulating(true);
      setBackendError(null);
      try {
        const amountMap: Record<FailureClass, number> = {
          MISSED_WEBHOOK: 6_450_000,
          DUPLICATE_OUT_OF_ORDER: 9_800_000,
          INVALID_SIGNATURE_REPLAY: 22_000_000,
          SUSPICIOUS_BURST: 14_500_000,
        };
        const created = await simulateWebhookIncident({
          failureClass,
          amountPaise: amountMap[failureClass],
          severity: failureClass === 'DUPLICATE_OUT_OF_ORDER' ? 'HIGH' : 'CRITICAL',
        });
        await loadIncidentList(created.incident.id);
        setDossier(created);
        setBannerMessage(`Injected synthetic ${failureClass} scenario (${created.incident.code}).`);
      } catch (err) {
        setBackendError(err instanceof Error ? err.message : 'Simulation failed.');
      } finally {
        setSimulating(false);
      }
    },
    [loadIncidentList],
  );

  const handleReset = useCallback(async () => {
    setSimulating(true);
    setBackendError(null);
    try {
      await resetAllScenarios();
      await loadIncidentList();
      setBannerMessage('Restored canonical Razorpay webhook incident scenarios in SQLite.');
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Scenario reset failed.');
    } finally {
      setSimulating(false);
    }
  }, [loadIncidentList]);

  const handleApprove = useCallback(
    async (payload: { operatorName: string; operatorRole: string; rationale: string }) => {
      if (!selectedIncidentId) return;
      setSubmittingApproval(true);
      setBackendError(null);
      try {
        const updated = await approveIncidentRecovery(selectedIncidentId, payload);
        setDossier(updated);
        setIncidents((prev) =>
          prev.map((item) =>
            item.id === updated.incident.id ? updated.incident : item,
          ),
        );
        setBannerMessage(
          `Recovery committed for ${updated.order.order_id}: state transitioned to ${updated.order.order_status}.`,
        );
      } catch (err) {
        setBackendError(err instanceof Error ? err.message : 'Approval failed.');
      } finally {
        setSubmittingApproval(false);
      }
    },
    [selectedIncidentId],
  );

  const handleReject = useCallback(
    async (payload: { operatorName: string; operatorRole: string; rationale: string }) => {
      if (!selectedIncidentId) return;
      setSubmittingApproval(true);
      setBackendError(null);
      try {
        const updated = await rejectIncidentRecovery(selectedIncidentId, payload);
        setDossier(updated);
        setIncidents((prev) =>
          prev.map((item) =>
            item.id === updated.incident.id ? updated.incident : item,
          ),
        );
        setBannerMessage(
          `Escalated ${updated.incident.code}; order ${updated.order.order_id} held in QUARANTINED.`,
        );
      } catch (err) {
        setBackendError(err instanceof Error ? err.message : 'Escalation failed.');
      } finally {
        setSubmittingApproval(false);
      }
    },
    [selectedIncidentId],
  );

  const filteredIncidents = useMemo(() => {
    if (statusFilter === 'ALL') return incidents;
    return incidents.filter((item) => item.status === statusFilter);
  }, [incidents, statusFilter]);

  const telemetrySeries: TelemetryPoint[] = useMemo(() => {
    if (!dossier) return [];
    try {
      return JSON.parse(dossier.incident.telemetry_json) as TelemetryPoint[];
    } catch {
      return [];
    }
  }, [dossier]);

  const activeIncident = dossier?.incident ?? incidents[0] ?? null;

  const revealInitial = prefersReducedMotion ? 'visible' : 'hidden';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-black text-white">
        <Navbar
          onInvestigateClick={() => {
            document.getElementById('pipeline-section')?.scrollIntoView({ behavior: 'smooth' });
            void handleRunInvestigation();
          }}
          investigating={investigating}
          activeSection="core"
        />

        {/* Hero Section: Bugatti Austere Editorial Framing + Staggered Reveal + 3D Obsidian Webhook Core */}
        <motion.section
          id="core-section"
          className="pt-14"
          initial={revealInitial}
          animate="visible"
          variants={sectionContainerVariants}
        >
          <div className="mx-auto max-w-[1280px] px-6 pt-16 pb-12 text-center md:px-10 md:pt-20 md:pb-16">
            <motion.div variants={sectionChildVariants} className="mb-6 flex justify-center">
              <BrandEmblem className="h-14 w-14 p-1" />
            </motion.div>
            <motion.p
              variants={sectionChildVariants}
              className="font-machined text-[11px] tracking-[2.5px] uppercase text-[#999999]"
            >
              Razorpay Webhook Integrity · Signature Forensics · Safe Order Recovery
            </motion.p>
            <motion.h1
              variants={sectionChildVariants}
              className="font-display mx-auto mt-5 max-w-4xl text-[38px] leading-[1.08] tracking-[3px] uppercase text-white md:text-[64px] md:tracking-[4px]"
            >
              When Payment Succeeds, Orders Never Fall Behind
            </motion.h1>
            <motion.p
              variants={sectionChildVariants}
              className="font-editorial mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-[#cccccc]"
            >
              Autonomous multi-agent investigation and cryptographic verification for missed webhook deliveries, duplicate out-of-order races, invalid HMAC-SHA256 signatures, and replay probes.
            </motion.p>

            <motion.div
              variants={sectionChildVariants}
              className="mt-9 flex flex-wrap items-center justify-center gap-4"
            >
              <a href="#pipeline-section" className="btn-aureon-pill">
                Inspect Live Incidents
              </a>
              <button
                type="button"
                onClick={() => handleSimulate('MISSED_WEBHOOK')}
                disabled={simulating}
                className="btn-aureon-secondary"
              >
                {simulating ? 'Injecting...' : 'Inject Missed Webhook'}
              </button>
            </motion.div>
          </div>

          <motion.div variants={sectionChildVariants}>
            <WebhookCore3D
              incident={activeIncident}
              webhookEvents={dossier?.webhookEvents ?? []}
              reducedMotion={prefersReducedMotion}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            />
          </motion.div>
        </motion.section>

        {/* Connection Error / Feedback Banner */}
        <div className="mx-auto max-w-[1280px] px-6 md:px-10">
          {backendError && (
            <div
              role="alert"
              className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-[#cf524c] bg-[#141414] px-6 py-4"
            >
              <span className="font-machined text-[12px] text-[#cf524c]">{backendError}</span>
              <button
                type="button"
                onClick={() => void loadIncidentList(selectedIncidentId ?? undefined)}
                className="btn-aureon-secondary !h-9 !px-5"
              >
                Retry Connection
              </button>
            </div>
          )}

          {bannerMessage && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-[#3a3a3a] bg-[#0d0d0d] px-6 py-3.5">
              <span className="font-machined text-[12px] text-[#c3d9f3]">{bannerMessage}</span>
              <button
                type="button"
                onClick={() => setBannerMessage(null)}
                className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999] hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Section 1: Incident Queue & Multi-Agent Pipeline */}
        <motion.section
          id="pipeline-section"
          className="mx-auto max-w-[1280px] px-6 pt-24 md:px-10 md:pt-[120px]"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.12 }}
          variants={sectionContainerVariants}
        >
          <motion.div
            variants={sectionChildVariants}
            className="flex flex-wrap items-end justify-between gap-6 border-b border-[#262626] pb-6"
          >
            <div>
              <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
                SQLite Incident Ledger · Active Discrepancies
              </div>
              <h2 className="font-display mt-2 text-[36px] tracking-[2.5px] uppercase text-white md:text-[48px] md:tracking-[3px]">
                Webhook Incident Dossiers
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleSimulate('DUPLICATE_OUT_OF_ORDER')}
                disabled={simulating}
                className="btn-aureon-secondary !h-10 !px-4 !text-[11px]"
              >
                + Out-of-Order Race
              </button>
              <button
                type="button"
                onClick={() => handleSimulate('INVALID_SIGNATURE_REPLAY')}
                disabled={simulating}
                className="btn-aureon-secondary !h-10 !px-4 !text-[11px]"
              >
                + Replay &amp; Bad Sig
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={simulating}
                className="btn-aureon-secondary !h-10 !px-4 !text-[11px]"
              >
                Reset Scenarios
              </button>
            </div>
          </motion.div>

          {/* Segmented Filter Controls */}
          <motion.div variants={sectionChildVariants} className="mt-6 flex flex-wrap items-center gap-2">
            {['ALL', 'OPEN', 'AWAITING_APPROVAL', 'CONTAINED', 'ESCALATED'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`font-machined whitespace-nowrap border px-4 py-2 text-[11px] tracking-[2px] uppercase transition-colors ${
                  statusFilter === status
                    ? 'border-white bg-[#141414] text-white'
                    : 'border-[#262626] text-[#999999] hover:text-white'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </motion.div>

          {/* Incident Selector Rows (Skeleton / Empty / Populated) */}
          <motion.div variants={sectionChildVariants} className="mt-6 border border-[#262626] bg-[#0d0d0d]">
            {loadingList ? (
              <div className="divide-y divide-[#262626]">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-20 items-center justify-between px-6">
                    <div className="h-4 w-72 bg-[#1f1f1f]" />
                    <div className="h-4 w-32 bg-[#1f1f1f]" />
                  </div>
                ))}
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="font-display text-[22px] tracking-[2px] uppercase text-white">
                  No Incidents Match Filter
                </div>
                <p className="font-editorial mt-2 text-[16px] text-[#999999]">
                  Switch filters or inject a new synthetic Razorpay webhook fault to test investigation and recovery.
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="btn-aureon-pill mt-6"
                >
                  Show All Incidents
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#262626]">
                {filteredIncidents.map((item) => {
                  const selected = item.id === selectedIncidentId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedIncidentId(item.id)}
                      className={`grid w-full grid-cols-1 gap-3 px-6 py-5 text-left transition-colors md:grid-cols-12 md:items-center ${
                        selected ? 'bg-[#141414]' : 'hover:bg-[#141414]/60'
                      }`}
                    >
                      <div className="md:col-span-6">
                        <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
                          {item.code} · {item.order_id} · {item.failure_class}
                        </div>
                        <div className="font-display mt-1 text-[22px] tracking-[1.2px] uppercase text-white">
                          {item.title}
                        </div>
                      </div>
                      <div className="font-machined text-[13px] tabular-nums text-[#cccccc] md:col-span-3">
                        {formatInr(item.amount_paise)}
                      </div>
                      <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
                        <span
                          className={`font-machined text-[11px] tracking-[2px] uppercase ${
                            item.status === 'CONTAINED'
                              ? 'text-[#5fa657]'
                              : item.severity === 'CRITICAL'
                                ? 'text-[#cf524c]'
                                : 'text-[#d4a017]'
                          }`}
                        >
                          {item.severity} · {item.status}
                        </span>
                        <span className="font-machined text-[12px] text-[#c3d9f3]">
                          {selected ? 'Active →' : 'Inspect'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Multi-Agent Investigation Pipeline (React Flow) */}
          <motion.div variants={sectionChildVariants} className="mt-10">
            {loadingDossier && !dossier ? (
              <div className="h-[420px] border border-[#262626] bg-[#0d0d0d] p-8 font-machined text-[12px] tracking-[2px] uppercase text-[#666666]">
                Loading investigation pipeline...
              </div>
            ) : (
              <AgentPipelineFlow
                agentRuns={dossier?.agentRuns ?? []}
                onRunInvestigation={() => void handleRunInvestigation()}
                investigating={investigating}
              />
            )}
          </motion.div>
        </motion.section>

        {/* Section 2: Telemetry, Cryptographic Audit & Gemini AI Forensic Advisor */}
        <motion.section
          id="forensics-section"
          className="mx-auto max-w-[1280px] px-6 pt-24 md:px-10 md:pt-[120px]"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={sectionContainerVariants}
        >
          <motion.div variants={sectionChildVariants} className="mb-10 border-b border-[#262626] pb-6">
            <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
              Authoritative Gateway vs Merchant Order State
            </div>
            <h2 className="font-display mt-2 text-[36px] tracking-[2.5px] uppercase text-white md:text-[48px] md:tracking-[3px]">
              Webhook Telemetry, AI Forensics &amp; Signature Audit
            </h2>
          </motion.div>

          {dossier ? (
            <div className="space-y-10">
              <motion.div variants={sectionChildVariants}>
                <TelemetryCharts
                  telemetry={telemetrySeries}
                  order={dossier.order}
                  webhookEvents={dossier.webhookEvents}
                  onLoadWebhookIntoLab={(ev) => {
                    setSelectedWebhook(ev);
                    labRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              </motion.div>

              <motion.div variants={sectionChildVariants}>
                <AiForensicAdvisor dossier={dossier} />
              </motion.div>

              <motion.div variants={sectionChildVariants} ref={labRef}>
                <SecurityVerificationLab selectedWebhook={selectedWebhook} />
              </motion.div>
            </div>
          ) : (
            <motion.div
              variants={sectionChildVariants}
              className="border border-[#262626] bg-[#0d0d0d] p-12 text-center font-machined text-[12px] tracking-[2px] uppercase text-[#666666]"
            >
              Select an incident above to inspect telemetry and raw webhook payloads.
            </motion.div>
          )}
        </motion.section>

        {/* Section 3: Human Approval & Safe Order Recovery */}
        <motion.section
          id="recovery-section"
          className="mx-auto max-w-[1280px] px-6 pt-24 md:px-10 md:pt-[120px]"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.12 }}
          variants={sectionContainerVariants}
        >
          <motion.div variants={sectionChildVariants} className="mb-10 border-b border-[#262626] pb-6">
            <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
              Controlled Remediation · Zero Blind Mutations
            </div>
            <h2 className="font-display mt-2 text-[36px] tracking-[2.5px] uppercase text-white md:text-[48px] md:tracking-[3px]">
              Human Approval &amp; Safe Recovery Simulation
            </h2>
          </motion.div>

          {dossier && (
            <motion.div variants={sectionChildVariants}>
              <RecoveryGatePanel
                dossier={dossier}
                onApprove={handleApprove}
                onReject={handleReject}
                submitting={submittingApproval}
              />
            </motion.div>
          )}
        </motion.section>

        {/* Section 4: Windows FastAPI + LangGraph + Ollama Bundle & 5-Min Demo Script */}
        <motion.section
          id="windows-section"
          className="mx-auto max-w-[1280px] px-6 pt-24 pb-24 md:px-10 md:pt-[120px] md:pb-[120px]"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={sectionContainerVariants}
        >
          <motion.div variants={sectionChildVariants} className="mb-10 border-b border-[#262626] pb-6">
            <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
              Local Windows Execution · Architecture · Presentation
            </div>
            <h2 className="font-display mt-2 text-[36px] tracking-[2.5px] uppercase text-white md:text-[48px] md:tracking-[3px]">
              Engineering Deliverables &amp; Runbook
            </h2>
          </motion.div>

          <motion.div variants={sectionChildVariants}>
            <WindowsBundleSection />
          </motion.div>
        </motion.section>

        {/* Editorial Full-Bleed Obsidian Core Studio Image Band */}
        <motion.section
          aria-label="Obsidian Core Architectural Render"
          className="relative min-h-[420px] overflow-hidden border-t border-[#262626] bg-black"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={sectionContainerVariants}
        >
          {!coreBandImgFailed && (
            <img
              src="/src/assets/images/aureon_core_backdrop_1794927494263.jpg"
              alt="AUREON Obsidian Webhook Core surrounded by machined concentric titanium rings"
              referrerPolicy="no-referrer"
              onError={() => setCoreBandImgFailed(true)}
              className="absolute inset-0 h-full w-full object-cover opacity-75"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/80" />

          <div className="relative z-10 mx-auto flex min-h-[420px] max-w-[1280px] flex-col items-center justify-center px-6 py-20 text-center md:px-10">
            <motion.div
              variants={sectionChildVariants}
              className="font-machined text-[11px] tracking-[2.5px] uppercase text-[#999999]"
            >
              Architectural Precision · Signature-First Settlement Defense
            </motion.div>
            <motion.h2
              variants={sectionChildVariants}
              className="font-display mt-4 max-w-3xl text-[32px] leading-[1.12] tracking-[3px] uppercase text-white md:text-[48px]"
            >
              Every Captured Rupee Reconciled Before Fulfillment
            </motion.h2>
            <motion.p
              variants={sectionChildVariants}
              className="font-editorial mt-4 max-w-xl text-[17px] text-[#cccccc]"
            >
              Inspect the real-time 3D mechanism above or toggle Studio Image mode inside the viewport dock at any time.
            </motion.p>
            <motion.div variants={sectionChildVariants} className="mt-8">
              <a href="#core-section" className="btn-aureon-pill">
                Return to 3D Core
              </a>
            </motion.div>
          </div>
        </motion.section>

        {/* Bugatti Austere Footer */}
        <motion.footer
          className="border-t border-[#262626] bg-black px-6 py-16 text-center"
          initial={revealInitial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={sectionContainerVariants}
        >
          <div className="mx-auto max-w-[1280px] space-y-6">
            <motion.div variants={sectionChildVariants} className="flex justify-center">
              <BrandEmblem className="h-12 w-12 p-1" />
            </motion.div>
            <motion.div
              variants={sectionChildVariants}
              className="font-display text-[16px] tracking-[6px] uppercase text-white"
            >
              AUREON
            </motion.div>
            <motion.p
              variants={sectionChildVariants}
              className="font-editorial mx-auto max-w-xl text-[14px] text-[#999999]"
            >
              Payment webhook reliability, HMAC-SHA256 raw-body verification, replay protection, and human-approved merchant order recovery.
            </motion.p>
            <motion.div
              variants={sectionChildVariants}
              className="font-machined text-[11px] tracking-[2px] uppercase text-[#666666]"
            >
              © 2026 AUREON SYSTEMS · SQLITE AUDIT PERSISTENCE · ZERO BLIND MUTATIONS
            </motion.div>
          </div>
        </motion.footer>
      </div>
    </MotionConfig>
  );
}
