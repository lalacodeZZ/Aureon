# AUREON — AI-Assisted Payment Webhook Monitoring & Safe Order Recovery

A luxury-engineered payment reliability and webhook security platform built to solve the real-world merchant failure mode where a customer's payment succeeds on Razorpay yet the merchant's order remains stuck or corrupted due to missed deliveries, duplicate retries, out-of-order events, invalid `X-Razorpay-Signature` headers, or replay probes.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
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
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Option 1 — Run Full-Stack Node/Express/SQLite App (Cross-Platform)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
3. Start development server on port `3000`:
   ```bash
   npm run dev
   ```
4. Run automated Node test suite:
   ```bash
   npm test
   ```

---

## Option 2 — Local Windows Execution (FastAPI + LangGraph + Ollama `qwen2.5:3b` + SQLite)

### Prerequisites on Windows 10 / 11
1. Install **Python 3.11+** (`python --version`).
2. Install **Ollama for Windows** and pull the local model:
   ```powershell
   ollama pull qwen2.5:3b
   ```

### Automated Setup & Launch (Windows)
```bat
windows_bundle\setup_windows.bat
powershell -ExecutionPolicy Bypass -File windows_bundle\run_windows.ps1
```

### Manual Windows Commands
```powershell
cd windows_bundle
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Run Python Pytest Suite
```powershell
pytest windows_bundle/tests/test_webhook_security.py -v
```

---

## Five-Minute Demonstration Script

See `windows_bundle/DEMO_SCRIPT_5MIN.md` for the timed 5-minute executive walkthrough covering the 3D Obsidian Webhook Core, live multi-agent investigation stream, Razorpay signature & JSON re-parse verification lab, human-approved SQLite order reconciliation, and Windows FastAPI/LangGraph/Ollama parity.
