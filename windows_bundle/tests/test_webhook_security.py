import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import get_connection, list_incidents
from app.security import (
    compute_webhook_hmac,
    evaluate_replay_and_skew,
    redact_secrets,
    verify_webhook_signature,
)


def test_raw_body_hmac_and_json_reparse_pitfall():
    raw = json.dumps({"event": "payment.captured", "amount": 4850000}, indent=2)
    sig = compute_webhook_hmac(raw)

    ok = verify_webhook_signature(raw, sig)
    assert ok["valid"] is True

    reparsed = verify_webhook_signature(raw, sig, simulate_json_reparse=True)
    assert reparsed["valid"] is False
    assert reparsed["reparsed_mismatch"] is True


def test_replay_and_redaction():
    rep = evaluate_replay_and_skew("evt_dup", 1000, {"evt_dup"}, now_unix=1010)
    assert rep["replay_detected"] is True

    text, count = redact_secrets("secret=whsec_12345678 vpa=user@okicici")
    assert count == 2
    assert "whsec_12345678" not in text


def test_sqlite_seed():
    conn = get_connection(":memory:")
    incidents = list_incidents(conn)
    assert len(incidents) == 3
    conn.close()
