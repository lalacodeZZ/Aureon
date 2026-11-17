import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

const ARCHITECTURE_DIAGRAM = `┌──────────────────────────────────────────────────────────────────────────────┐
│                     AUREON WEBHOOK SECURITY CONTROL PLANE                    │
└──────────────────────────────────────────────────────────────────────────────┘
       │                                                       │
       ▼                                                       ▼
┌──────────────────────┐                             ┌─────────────────────────┐
│ Razorpay Webhook     │   Raw Body + Signature      │ Client (React + Vite)   │
│ POST /webhooks       │────────────────────────────▶│ - 3D Obsidian Core      │
│ X-Razorpay-Signature │                             │ - React Flow Agent DAG  │
│ X-Razorpay-Event-Id  │                             │ - Recharts Telemetry    │
└──────────┬───────────┘                             └────────────┬────────────┘
           │                                                      │ HTTP / SSE
           ▼                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 BACKEND ENGINE (Express / FastAPI on Windows)                │
│                                                                              │
│  ┌──────────────────────────────┐     ┌───────────────────────────────────┐  │
│  │ Deterministic Crypto Gate    │     │ Multi-Agent Investigation Graph   │  │
│  │ - Raw-Buffer HMAC-SHA256     │────▶│ 01. Order & Gateway Reconciler    │  │
│  │ - Event-ID Replay Window     │     │ 02. Signature & Replay Forensics  │  │
│  │ - State Precedence Guard     │     │ 03. Ordering & Idempotency Guard  │  │
│  │ - Secret & VPA Redactor      │     │ 04. Safe Recovery Planner         │  │
│  └──────────────┬───────────────┘     │ 05. Human Governance Gate         │  │
│                 │                     └─────────────────┬─────────────────┘  │
│                 └──────────────────┬────────────────────┘                    │
│                                    ▼                                         │
│                     SQLite Persistence & Audit Ledger                        │
│     [ merchant_orders | webhook_events | incidents | recovery_approvals ]    │
└──────────────────────────────────────────────────────────────────────────────┘`;

const WINDOWS_COMMANDS = `# 1. Install & pull local Ollama model on Windows
ollama pull qwen2.5:3b

# 2. One-click Python FastAPI + LangGraph setup
windows_bundle\\setup_windows.bat

# 3. Launch Windows FastAPI + LangGraph + Ollama server
powershell -ExecutionPolicy Bypass -File windows_bundle\\run_windows.ps1

# 4. Run automated Python & Node security verification tests
pytest windows_bundle\\tests\\test_webhook_security.py -v
npm test`;

const DEMO_STEPS = [
  {
    minute: '00:00 – 01:00',
    title: '01. Spatial Core & Problem Framing',
    detail:
      'Open the 3D Obsidian Webhook Core. Toggle Exploded View to show Gateway Ingress, HMAC-SHA256 Gate, and Merchant Order Ledger. Explain how payment.captured succeeds on Razorpay while ORD-90412 sits stuck at PENDING.',
  },
  {
    minute: '01:00 – 02:15',
    title: '02. Multi-Agent Investigation Stream',
    detail:
      'Click Run Investigation on INC-2026-0901. Watch the React Flow DAG transition live over SSE through Reconciler, Crypto Forensics, Ordering Guard, Recovery Planner, and pause at the Human Governance Gate.',
  },
  {
    minute: '02:15 – 03:30',
    title: '03. Signature, JSON Re-Parse & Replay Proof',
    detail:
      'Load INC-2026-0903 in the Security Verification Lab. Demonstrate a forged X-Razorpay-Signature rejection, then load a valid payload and toggle "Simulate JSON.parse Re-Serialization Pitfall" to prove why raw buffers are mandatory.',
  },
  {
    minute: '03:30 – 04:20',
    title: '04. Human-Approved Safe Order Recovery',
    detail:
      'Return to the Recovery Gate, enter operator credentials and rationale, and execute Approve Safe Recovery. Observe ORD-90412 transition PENDING → RECONCILED with an immutable SHA-256 seal and 3D core restoration.',
  },
  {
    minute: '04:20 – 05:00',
    title: '05. Fault Injection & Windows Local Runtime',
    detail:
      'Inject a fresh synthetic DUPLICATE_OUT_OF_ORDER scenario and showcase the bundled Windows FastAPI + LangGraph + Ollama (qwen2.5:3b) scripts and passing test suites.',
  },
];

export function WindowsBundleSection() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(WINDOWS_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in sandbox; ignore silently
    }
  }

  return (
    <div className="space-y-12">
      <div className="border border-[#262626] bg-[#0d0d0d] p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262626] pb-5">
          <div>
            <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
              System Blueprint · Dual Runtime Parity
            </div>
            <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
              Architecture &amp; Windows FastAPI + LangGraph + Ollama Bundle
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-aureon-secondary !h-10"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[#5fa657]" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Commands Copied' : 'Copy Windows Commands'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="font-machined mb-2 text-[10px] tracking-[2px] uppercase text-[#999999]">
              System Architecture Diagram
            </div>
            <pre className="overflow-x-auto border border-[#262626] bg-black p-4 font-machined text-[10px] leading-relaxed text-[#cccccc]">
              {ARCHITECTURE_DIAGRAM}
            </pre>
          </div>

          <div className="lg:col-span-5">
            <div className="font-machined mb-2 text-[10px] tracking-[2px] uppercase text-[#999999]">
              Windows Execution Commands (FastAPI · LangGraph · Qwen2.5:3B)
            </div>
            <pre className="overflow-x-auto border border-[#262626] bg-black p-4 font-machined text-[11px] leading-relaxed text-[#c3d9f3]">
              {WINDOWS_COMMANDS}
            </pre>
            <p className="font-editorial mt-4 text-[15px] text-[#999999]">
              Complete Python FastAPI, LangGraph StateGraph, Ollama integration, SQLite schema, and pytest verification suite are packaged inside <span className="font-machined text-[12px] text-[#cccccc]">windows_bundle/</span>.
            </p>
          </div>
        </div>
      </div>

      {/* 5-Minute Executive Demo Script */}
      <div className="border border-[#262626] bg-[#0d0d0d] p-6 md:p-8">
        <div className="border-b border-[#262626] pb-5">
          <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
            Live Walkthrough Protocol
          </div>
          <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
            Five-Minute Demonstration Script
          </h3>
        </div>

        <div className="divide-y divide-[#262626]">
          {DEMO_STEPS.map((step) => (
            <div
              key={step.title}
              className="grid grid-cols-1 gap-4 py-5 md:grid-cols-12 md:items-baseline"
            >
              <div className="font-machined text-[12px] tracking-[2px] text-[#c3d9f3] md:col-span-2">
                {step.minute}
              </div>
              <div className="font-display text-[20px] tracking-[1.5px] uppercase text-white md:col-span-4">
                {step.title}
              </div>
              <p className="font-editorial text-[16px] leading-relaxed text-[#cccccc] md:col-span-6">
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
