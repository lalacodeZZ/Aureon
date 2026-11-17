# AUREON — Five-Minute Executive Demonstration Script

1. **00:00 – 01:00 | Spatial Command & Problem Context**
   - Present the Bugatti-inspired `#000000` canvas and interactive **3D Obsidian Webhook Core**.
   - Toggle **Explode** in the bottom Cinema Dock to separate Gateway Ingress, HMAC-SHA256 Verification Ring, and Merchant Order Ledger.
   - Frame the real Razorpay problem: payment `pay_Q9x7Lm0412A` succeeded (`captured`), yet `ORD-90412` stayed `PENDING` after `504` webhook delivery timeouts.

2. **01:00 – 02:15 | Live Multi-Agent Investigation (React Flow + SSE)**
   - Click **Run Investigation** on `INC-2026-0901`.
   - Observe each React Flow stage transition live over SSE (`Order & Gateway Reconciler` → `Signature & Replay Forensics` → `Ordering & Idempotency Guard` → `Safe Recovery Planner` → `Human Governance Gate`).

3. **02:15 – 03:30 | Cybersecurity Forensics Lab**
   - Select `INC-2026-0903` and click **Verify Payload** to load the forged webhook into the Razorpay Security Lab.
   - Run **Run Security Audit** to confirm `X-Razorpay-Signature` HMAC rejection, replay detection, and automatic secret/VPA redaction.
   - Load a valid payload and toggle **Simulate JSON.parse Re-Serialization Pitfall** to show why reading the raw request Buffer is mandatory.

4. **03:30 – 04:20 | Human-Approved Safe Order Recovery**
   - Move to the **Safe Order Recovery & Quarantine Gate** for `INC-2026-0901`.
   - Enter operator details and rationale, click **Approve Safe Recovery**, and verify `ORD-90412` transitions atomically to `RECONCILED` with a SHA-256 audit seal.

5. **04:20 – 05:00 | Synthetic Fault Injection & Windows Local Runtime**
   - Click **+ Out-of-Order Race** to create a live SQLite discrepancy, then show `windows_bundle/` running FastAPI + LangGraph + Ollama (`qwen2.5:3b`) and `npm test`.
