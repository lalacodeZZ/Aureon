import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .security import compute_webhook_hmac


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    resolved = db_path or os.getenv("AUREON_PY_DB_PATH", "./data/aureon_win.db")
    if resolved != ":memory:":
        Path(resolved).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(resolved, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_schema(conn)
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS merchant_orders (
            order_id TEXT PRIMARY KEY,
            payment_id TEXT NOT NULL,
            amount_paise INTEGER NOT NULL,
            order_status TEXT NOT NULL,
            gateway_status TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            title TEXT NOT NULL,
            failure_class TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            order_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS webhook_events (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            raw_payload TEXT NOT NULL,
            received_signature TEXT NOT NULL,
            signature_valid INTEGER NOT NULL,
            replay_detected INTEGER NOT NULL,
            created_at_unix INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recovery_approvals (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            order_id TEXT NOT NULL,
            decision TEXT NOT NULL,
            operator_name TEXT NOT NULL,
            rationale TEXT NOT NULL,
            decided_at TEXT NOT NULL
        );
        """
    )
    count = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
    if count == 0:
        seed_default_data(conn)


def seed_default_data(conn: sqlite3.Connection) -> None:
    now_unix = int(time.time())
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now_unix))

    seeds = [
        (
            "inc-wh-01",
            "INC-2026-0901",
            "Missed Payment Capture Webhook — Order Stuck Pending",
            "MISSED_WEBHOOK",
            "CRITICAL",
            "ORD-90412",
            "pay_Q9x7Lm0412A",
            4850000,
            "PENDING",
            "captured",
            "evt_90412_cap_02",
            "payment.captured",
            True,
            False,
        ),
        (
            "inc-wh-02",
            "INC-2026-0902",
            "Duplicate Delivery & Out-of-Order Event Race",
            "DUPLICATE_OUT_OF_ORDER",
            "HIGH",
            "ORD-90418",
            "pay_Q9x8Kp0418B",
            12400000,
            "PENDING",
            "captured",
            "evt_90418_cap_03",
            "payment.captured",
            True,
            True,
        ),
        (
            "inc-wh-03",
            "INC-2026-0903",
            "Invalid X-Razorpay-Signature & Replay Attack Probe",
            "INVALID_SIGNATURE_REPLAY",
            "CRITICAL",
            "ORD-90425",
            "pay_SPOOF99425Z",
            29500000,
            "PENDING",
            "failed",
            "evt_90425_forged_01",
            "payment.captured",
            False,
            True,
        ),
    ]

    for (
        inc_id,
        code,
        title,
        failure_class,
        severity,
        order_id,
        pay_id,
        amount_paise,
        order_status,
        gateway_status,
        event_id,
        event_type,
        sig_valid,
        replay,
    ) in seeds:
        conn.execute(
            "INSERT INTO merchant_orders VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, pay_id, amount_paise, order_status, gateway_status, now_iso),
        )
        conn.execute(
            "INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (inc_id, code, title, failure_class, severity, "OPEN", order_id, title, now_iso),
        )
        payload = json.dumps(
            {
                "event": event_type,
                "event_id": event_id,
                "created_at": now_unix - 60,
                "payload": {
                    "payment": {"entity": {"id": pay_id, "order_id": order_id, "amount": amount_paise}}
                },
            }
        )
        sig = compute_webhook_hmac(payload) if sig_valid else "deadbeef" * 8
        conn.execute(
            "INSERT INTO webhook_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                f"{inc_id}-wh-1",
                inc_id,
                event_id,
                event_type,
                payload,
                sig,
                1 if sig_valid else 0,
                1 if replay else 0,
                now_unix - 60,
            ),
        )
    conn.commit()


def list_incidents(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = conn.execute("SELECT * FROM incidents ORDER BY code ASC").fetchall()
    return [dict(r) for r in rows]
