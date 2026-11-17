import time
import uuid
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import get_connection, list_incidents
from .graph import build_investigation_graph
from .security import evaluate_replay_and_skew, redact_secrets, verify_webhook_signature

app = FastAPI(title="AUREON Webhook Control Plane (Windows FastAPI)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

conn = get_connection()
graph = build_investigation_graph()


class ApprovalBody(BaseModel):
    operator_name: str
    rationale: str


class VerifyBody(BaseModel):
    raw_payload: str
    provided_signature: str
    event_id: str = "evt_probe"
    created_at_unix: int = 0
    simulate_json_reparse: bool = False


@app.get("/api/health")
def health():
    return {"status": "ok", "runtime": "fastapi-langgraph-ollama", "incidents": len(list_incidents(conn))}


@app.get("/api/incidents")
def get_incidents():
    return {"incidents": list_incidents(conn)}


@app.post("/api/incidents/{incident_id}/investigate")
def investigate_incident(incident_id: str):
    inc = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    order = conn.execute("SELECT * FROM merchant_orders WHERE order_id = ?", (inc["order_id"],)).fetchone()
    webhooks = [
        dict(r)
        for r in conn.execute("SELECT * FROM webhook_events WHERE incident_id = ?", (incident_id,)).fetchall()
    ]
    result = graph.invoke(
        {
            "incident": dict(inc),
            "order": dict(order),
            "webhooks": webhooks,
            "reconciliation_summary": "",
            "crypto_summary": "",
            "ordering_summary": "",
            "recovery_plan": "",
            "proposed_order_status": "PENDING",
            "awaiting_human_approval": False,
        }
    )
    conn.execute("UPDATE incidents SET status = 'AWAITING_APPROVAL' WHERE id = ?", (incident_id,))
    conn.commit()
    return result


@app.post("/api/incidents/{incident_id}/approve")
def approve_recovery(incident_id: str, body: ApprovalBody):
    inc = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    target = "QUARANTINED" if inc["failure_class"] == "INVALID_SIGNATURE_REPLAY" else "RECONCILED"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    conn.execute("UPDATE merchant_orders SET order_status = ?, updated_at = ? WHERE order_id = ?", (target, now_iso, inc["order_id"]))
    conn.execute("UPDATE incidents SET status = 'CONTAINED' WHERE id = ?", (incident_id,))
    conn.execute(
        "INSERT INTO recovery_approvals VALUES (?, ?, ?, ?, ?, ?, ?)",
        (f"apr-{uuid.uuid4().hex[:8]}", incident_id, inc["order_id"], "APPROVED", body.operator_name, body.rationale, now_iso),
    )
    conn.commit()
    return {"status": "contained", "order_id": inc["order_id"], "order_status": target}


@app.post("/api/security/verify-webhook")
def verify_webhook(body: VerifyBody):
    sig_res = verify_webhook_signature(
        body.raw_payload,
        body.provided_signature,
        simulate_json_reparse=body.simulate_json_reparse,
    )
    created = body.created_at_unix or int(time.time())
    replay_res = evaluate_replay_and_skew(body.event_id, created, set())
    redacted, count = redact_secrets(body.raw_payload)
    return {
        "signature": sig_res,
        "replay": replay_res,
        "redaction": {"redacted_text": redacted, "count": count},
    }


@app.post("/api/webhooks/razorpay")
async def receive_razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
    x_razorpay_event_id: str = Header(default="evt_live"),
):
    raw_bytes = await request.body()
    sig_res = verify_webhook_signature(raw_bytes, x_razorpay_signature)
    if not sig_res["valid"]:
        raise HTTPException(status_code=400, detail=sig_res["reason"])
    return {"status": "accepted", "event_id": x_razorpay_event_id}
