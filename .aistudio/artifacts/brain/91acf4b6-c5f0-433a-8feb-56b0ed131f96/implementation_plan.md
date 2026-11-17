# AUREON — AI-Assisted Payment Webhook Monitoring & Order Recovery

A Bugatti-inspired austere luxury security and reliability platform for **merchant payment webhook monitoring, cybersecurity forensics, and safe order recovery**—built specifically to solve the real-world failure mode where a customer's payment succeeds on Razorpay yet the merchant's order remains stuck or corrupted due to missed deliveries, duplicate retries, out-of-order events, invalid `X-Razorpay-Signature` headers, replay attacks, or suspicious webhook activity.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Revised per your feedback to center every workflow, 3D visualization, multi-agent stage, cryptographic utility, and synthetic scenario on **merchant payment webhook inconsistency detection, Razorpay-grade security forensics, and safe order recovery**.

- **Confirmed Decision 1 — Hybrid Runtime Delivery**: Live full-stack **Node / Express / SQLite / TypeScript** application running directly in the preview environment, paired with an exportable **Windows FastAPI + LangGraph + Ollama (`qwen2.5:3b`)** backend bundle, automated tests, architecture diagram, and 5-minute demo script.
- **Confirmed Decision 2 — Exact Problem Domain (Razorpay-Grounded Webhook Reliability & Security)**: Solve payment-succeeds / order-not-updated inconsistencies across four documented Razorpay failure modes:
  1. **Missed Delivery / Failed Retry** (`payment.captured` timed out or returned `5xx`, leaving merchant order stuck in `PENDING`)
  2. **Duplicate Webhook Delivery & Out-of-Order Events** (`order.paid` arriving before `payment.authorized`, or stale retry attempting to regress a settled order)
  3. **Invalid `X-Razorpay-Signature` & Raw-Body Tampering / Replay Attack** (spoofed webhook payload, parsed-JSON re-serialization mismatch, or replayed `X-Razorpay-Event-Id` outside tolerance window)
  4. **Suspicious Event Activity & Amount/State Mismatch** (forged `payment.captured` burst or mismatched `amount` / `order_id` probing)
- **Confirmed Decision 3 — Bugatti-Grade Visual Identity & 3D Obsidian Webhook Core**: Pure `#000000` black canvas, three-typeface system (`Saira Condensed` uppercase wide-tracked display, `Cormorant Garamond` serif narrative copy, `JetBrains Mono` machined UI/hashes/tabular metrics) at weight `400`, transparent `1px` white pill CTAs, `0px` architectural panels, and a centerpiece **3D Obsidian Webhook Core** (`Three.js` / `React Three Fiber` / `Drei`) depicting live payment-gateway-to-merchant-order trajectories, signature verification rings, and anomalous/blocked event vectors with a graceful 2D fallback.

---

## 1. Overview & Core Concept

- **What It Does**: AUREON continuously ingests and audits incoming payment webhook events (`payment.authorized`, `payment.captured`, `order.paid`, `payment.failed`), cross-references them against merchant order states and authoritative gateway payment records in SQLite, runs deterministic cybersecurity checks (`X-Razorpay-Signature` HMAC-SHA256 raw-body verification, `X-Razorpay-Event-Id` replay/idempotency detection, timestamp skew checks, and suspicious burst heuristics), dispatches a multi-agent investigation graph to diagnose root causes, and pauses at a human approval gate before executing safe, idempotent order recovery.
- **Target Audience / Persona**: Payment infrastructure engineers, merchant risk/security leads, and technical founders operating Razorpay-style checkout flows.
- **Key Value**: Turns silent checkout revenue loss and webhook spoofing into a transparent, cryptographically verified, human-approved recovery workflow—never blindly trusting unverified webhooks or automating irreversible state mutations without operator sign-off.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Spatial Webhook Command Hero**: Opens on a pure `#000000` canvas featuring the **3D Obsidian Webhook Core**—three concentric machined rings representing **Gateway Ingress (Razorpay)**, **Cryptographic & Replay Gate (`HMAC-SHA256` / Idempotency)**, and **Merchant Order Ledger**. Live event arcs travel from gateway to merchant; missed/orphaned payments, duplicate retries, invalid signatures, and replay vectors manifest as distinct spatial trajectories. A collapsible bottom Cinema Control Dock controls camera presets, exploded containment layers, and reduced-motion/HUD visibility without obstructing the 3D core.
2. **Webhook Inconsistency & Security Incident Queue**: Operators inspect live SQLite-backed incidents representing real merchant failures (e.g., *Customer Charged ₹48,500 — Order #ORD-90412 Stuck Pending*, *Out-of-Order & Duplicate Retry Storm on #ORD-90418*, *Forged Signature & Replay Probe on Webhook Endpoint*). Operators can filter by failure class/severity or inject a fresh synthetic Razorpay webhook fault (`Simulate Missed Webhook`, `Simulate Replay Attack`, `Simulate Out-of-Order Race`).
3. **Multi-Agent Investigation Graph (React Flow + Live SSE)**: Triggering **Investigate Incident** runs the backend 5-stage agent graph and updates a sleek `0px`-cornered **React Flow** DAG in real time:
   - `01. Webhook & Order Reconciliation Agent` (compares gateway capture state vs. merchant order status)
   - `02. Signature & Replay Forensics Agent` (executes deterministic HMAC-SHA256 raw-body check, event-ID replay check, and burst/IP anomaly scoring)
   - `03. Ordering & Idempotency Diagnostician` (detects `created_at` regressions, middleware JSON-mutation bugs, and retry backoff exhaustion)
   - `04. Safe Recovery Planner` (computes idempotent patch plan + risk assessment)
   - `05. Human Approval Gate` (hard pause awaiting operator decision)
4. **Security Verification Lab & Telemetry (Recharts)**: Operators examine Recharts time-series charts (webhook delivery latency, `5xx` retry spikes, signature-failure bursts vs. verified captures) and run interactive **Cryptographic Verification Utilities** directly against raw webhook payloads—testing valid vs. tampered `X-Razorpay-Signature` headers, raw-buffer vs. re-serialized JSON mismatches, replay nonce rejection, and secret redaction.
5. **Human Approval & Safe Order Recovery Simulation**: At the Human Approval Gate, the operator reviews the exact SQLite order diff (`PENDING -> PAID_RECONCILED` or `QUARANTINED_SPOOF`), enters operator identity and rationale, and clicks **Approve Safe Recovery** or **Block & Quarantine Source**. The backend executes the idempotent recovery transaction, logs a signed audit entry in SQLite, reconciles the merchant order, and settles the 3D Obsidian Core back to nominal equilibrium.
6. **Windows FastAPI / LangGraph / Ollama Bundle & Demo Kit**: Dedicated operational reference section presenting the system architecture diagram, exact Windows setup and run commands for FastAPI + LangGraph + Ollama (`qwen2.5:3b`), and a timed 5-minute demonstration script.

### Visual Identity & Theme

- **Aesthetic Direction**: Bugatti's hyper-minimal monochrome luxury—pure `#000000` canvas, vast `120px` vertical breathing room, sharp `0px` containers, and photography/3D sculptural light as the sole visual drama.
- **Color Palette**:
  - `--canvas`: `#000000`
  - `--surface-soft`: `#0d0d0d`
  - `--surface-card`: `#141414`
  - `--surface-elevated`: `#1f1f1f`
  - `--hairline` / `--hairline-strong`: `#262626` / `#3a3a3a`
  - `--ink` / `--body` / `--muted`: `#ffffff` / `#cccccc` / `#999999`
  - `--link`: `#c3d9f3` (desaturated ice-blue for inline links and active focus rings)
  - `--warning` / `--success`: `#d4a017` / `#5fa657` (always paired with explicit monospace status text)
- **Typography (Weight `400` Only)**:
  - **Display (`Saira Condensed`)**: Uppercase, `2px–6px` tracking (`64px` hero, `48px` section heads, `32px` subheads, `14px` `AUREON` top-nav wordmark).
  - **Body (`Cormorant Garamond`)**: Sentence-case editorial serif (`16px` / `14px`) for root-cause narratives, recovery rationales, and executive summaries.
  - **Machined UI & Data (`JetBrains Mono`)**: Uppercase `11px–14px` with `2px–2.5px` tracking and `tabular-nums` for transparent pill buttons, nav items, `X-Razorpay-Signature` digests, event IDs, timestamps, and order amounts.
- **Top Bar & Shapes**: 3-zone `56px` transparent top nav (section links left, centered `AUREON` wordmark, single `INVESTIGATE` pill CTA right); `0px` rectangular corners everywhere except `9999px` transparent `1px solid #ffffff` pill buttons and `40px` circular icon buttons; underline-only `text-input` fields.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Real HMAC-SHA256 & Idempotency Engine vs. Simulated AI Text**
  - *Chosen Approach*: Implement genuine Node `crypto.createHmac('sha256', ...)` raw-buffer verification, timing-safe comparison (`crypto.timingSafeEqual`), `X-Razorpay-Event-Id` replay/idempotency store, timestamp skew window validation, and out-of-order state-machine guards on the server—paired with server-side Gemini (`@google/genai` `gemini-4-hydrogen`, or Ollama `qwen2.5:3b` in the Windows Python stack) for root-cause synthesis.
  - *Why*: Guarantees cybersecurity checks (invalid signatures, JSON re-serialization failures, replay indicators) are mathematically real and never fabricated by an LLM.
  - *Alternatives Considered*: Prompt-only mock classification without cryptographic primitives.

- **Decision 2 — Live Node/Express/SQLite App + Exportable Windows FastAPI/LangGraph/Ollama Bundle**
  - *Chosen Approach*: Run the interactive frontend against a live Express + `better-sqlite3` backend right inside the preview environment, while delivering a complete, tested Python FastAPI + LangGraph + Ollama (`qwen2.5:3b`) implementation and Windows `.bat`/PowerShell scripts alongside it.
  - *Why*: Ensures every button, live SSE investigation, SQLite order reconciliation, and 3D interaction works immediately in the browser while honoring the exact Windows local AI deployment requirement.
  - *Alternatives Considered*: Python-only backend (unrunnable in Node preview) or Node-only backend (missing LangGraph/Ollama Windows deliverables).

- **Decision 3 — Human Approval Gate Before Order Mutation**
  - *Chosen Approach*: Multi-agent workflows automatically halt at `AWAITING_APPROVAL` and require explicit operator confirmation (or rejection/quarantine) before applying order reconciliation or blocking a webhook source.
  - *Why*: Prevents automated false positives from marking unpaid/forged orders as `PAID` or prematurely disabling legitimate merchant webhook endpoints.
  - *Alternatives Considered*: Fully autonomous order state updates without human review.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        AUREON CLIENT (React + Vite)                        │
│                                                                            │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌────────────────┐  │
│  │ 3D Obsidian Webhook  │   │ React Flow Agent DAG │   │ Recharts +     │  │
│  │ Core (R3F + Drei +   │   │ (Reconcile -> Crypto │   │ Signature/     │  │
│  │ RoomEnvironment +    │   │  -> Order Guard ->   │   │ Replay Lab &   │  │
│  │ 2D SVG Fallback)     │   │  Plan -> Human Gate) │   │ Recovery Audit │  │
│  └──────────┬───────────┘   └──────────┬───────────┘   └───────┬────────┘  │
│             └──────────────────────────┼───────────────────────┘           │
│                                        ▼                                   │
│                 REST API + SSE Live Stream Client Layer                    │
└────────────────────────────────────────┬───────────────────────────────────┘
                                         │ HTTP / SSE (Port 3000)
                                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER RUNTIME (Node + TypeScript)               │
│                                                                            │
│  ┌────────────────────────┐   ┌─────────────────────────────────────────┐  │
│  │ Multi-Agent Webhook    │   │ Razorpay-Grade Security Utilities       │  │
│  │ Investigation Graph    │──▶│ - HMAC-SHA256 Raw-Body Signature Verify │  │
│  │ (State Machine +       │   │ - Replay & Event-ID Idempotency Guard   │  │
│  │  @google/genai Proxy)  │   │ - Timestamp Skew & Burst Detector       │  │
│  └──────────┬─────────────┘   │ - Webhook Secret / PII Redactor         │  │
│             │                 └────────────────────┬────────────────────┘  │
│             └──────────────────┬───────────────────┘                       │
│                                ▼                                           │
│                 SQLite Persistence Layer (better-sqlite3)                  │
│   [ merchant_orders | webhook_events | incidents | agent_runs | approvals ]│
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│          LOCAL WINDOWS DEPLOYMENT BUNDLE (Parallel Python Stack)           │
│   FastAPI Server ──▶ LangGraph StateGraph ──▶ Ollama (qwen2.5:3b) + SQLite │
│   + Pytest Suite + Windows Run Scripts + Architecture Diagram + Demo Kit   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`merchant_orders`**: Authoritative merchant checkout state (`order_id`, `customer_ref`, `amount_paise`, `currency`, `order_status` [`PENDING` | `PAID` | `QUARANTINED` | `RECONCILED`], `gateway_status` [`captured` | `authorized` | `failed`], `last_event_created_at`, `updated_at`).
- **`webhook_events`**: Raw and parsed webhook delivery log (`id`, `event_id`, `event_type`, `order_id`, `payment_id`, `raw_payload`, `received_signature`, `computed_signature`, `signature_valid`, `replay_detected`, `out_of_order`, `http_status_returned`, `retry_attempt`, `source_ip`, `received_at`).
- **`incidents`**: Detected payment-order inconsistencies & security anomalies (`id`, `code`, `title`, `failure_class` [`MISSED_WEBHOOK` | `DUPLICATE_OUT_OF_ORDER` | `INVALID_SIGNATURE_REPLAY` | `SUSPICIOUS_BURST`], `severity`, `status`, `order_id`, `recommended_action`, `telemetry_series`, `created_at`).
- **`agent_runs`**: Persisted multi-agent execution stages (`id`, `incident_id`, `stage`, `agent_name`, `status`, `summary`, `findings_json`, `duration_ms`, `created_at`).
- **`recovery_approvals`**: Immutable audit ledger of human sign-offs (`id`, `incident_id`, `order_id`, `decision`, `operator_name`, `rationale`, `state_before`, `state_after`, `verification_digest`, `decided_at`).

### Interactive Component & State Mapping

- **3D Obsidian Webhook Core**: Visualizes Gateway Ingress -> Cryptographic/Replay Gate -> Merchant Order Ledger. Clicking any ring or event arc inspects the corresponding live webhook event or order discrepancy; software-WebGL detection scales pixel ratio/shadows cleanly; WebGL-unavailable or `prefers-reduced-motion` switches to a crisp 2D schematic fallback.
- **Fault Injection & Scenario Controls**: Operators can trigger real simulated Razorpay failure scenarios (`POST /api/incidents/simulate`)—creating a genuine `merchant_orders` mismatch + `webhook_events` trace in SQLite—or reset baseline scenarios (`POST /api/incidents/reset`), with skeleton loading states and connection-error retry banners.
- **Multi-Agent Investigation DAG (React Flow + SSE)**: `POST /api/incidents/:id/investigate` streams real stage updates over SSE (`GET /api/incidents/:id/stream`), highlighting active agent nodes and surfacing exact SQLite order vs. webhook diffs before pausing at the Human Approval Gate.
- **Interactive Signature & Replay Verification Utility**: Operators can paste or load any webhook payload, toggle "simulate JSON middleware re-serialization" or "replay existing `X-Razorpay-Event-Id`", and call `POST /api/security/verify-webhook` to observe live deterministic `crypto.timingSafeEqual` pass/fail outputs and secret redaction.
- **Human Approval & Safe Order Recovery**: Submitting `POST /api/incidents/:id/approve` (or `/reject`) executes an atomic SQLite transaction updating `merchant_orders` safely (idempotent state guard + `recovery_approvals` audit record) and returns the 3D core from anomaly state to reconciled equilibrium.
