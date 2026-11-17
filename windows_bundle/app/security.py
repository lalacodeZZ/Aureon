import hashlib
import hmac
import json
import os
import re
import time
from typing import Dict, List, Set, Tuple

DEFAULT_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "whsec_aureon_sandbox_9948271a")


def compute_webhook_hmac(raw_payload: bytes | str, secret: str | None = None) -> str:
    key = (secret or DEFAULT_SECRET).encode("utf-8")
    body = raw_payload.encode("utf-8") if isinstance(raw_payload, str) else raw_payload
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def verify_webhook_signature(
    raw_payload: bytes | str,
    provided_signature: str,
    secret: str | None = None,
    simulate_json_reparse: bool = False,
) -> Dict[str, object]:
    raw_str = raw_payload.decode("utf-8") if isinstance(raw_payload, bytes) else raw_payload
    expected_raw = compute_webhook_hmac(raw_str, secret)

    evaluated_str = raw_str
    reparsed_mismatch = False
    if simulate_json_reparse:
        try:
            reparsed = json.dumps(json.loads(raw_str), separators=(",", ":"))
            if reparsed != raw_str:
                evaluated_str = reparsed
                reparsed_mismatch = True
        except json.JSONDecodeError:
            pass

    expected_eval = compute_webhook_hmac(evaluated_str, secret)
    normalized = (provided_signature or "").strip().lower()
    valid = bool(re.fullmatch(r"[0-9a-f]{64}", normalized)) and hmac.compare_digest(
        normalized, expected_eval
    )

    reason = "Signature verified against raw unparsed payload."
    if not valid:
        if reparsed_mismatch and hmac.compare_digest(normalized, expected_raw):
            reason = "Signature mismatch caused by JSON re-serialization altering whitespace/key order."
        else:
            reason = "Invalid X-Razorpay-Signature — tampered payload or untrusted origin."

    return {
        "valid": valid,
        "algorithm": "HMAC-SHA256",
        "reparsed_mismatch": reparsed_mismatch,
        "provided_prefix": normalized[:16] if normalized else "empty",
        "expected_prefix": expected_raw[:16],
        "reason": reason,
    }


def evaluate_replay_and_skew(
    event_id: str,
    created_at_unix: int,
    processed_event_ids: Set[str],
    now_unix: int | None = None,
    tolerance_seconds: int = 300,
) -> Dict[str, object]:
    now = now_unix if now_unix is not None else int(time.time())
    replay_detected = event_id in processed_event_ids
    skew_seconds = abs(now - created_at_unix)
    stale_timestamp = skew_seconds > tolerance_seconds

    return {
        "replay_detected": replay_detected,
        "stale_timestamp": stale_timestamp,
        "skew_seconds": skew_seconds,
        "tolerance_seconds": tolerance_seconds,
    }


def redact_secrets(raw_text: str) -> Tuple[str, int]:
    patterns: List[Tuple[str, str]] = [
        (r"\bwhsec_[A-Za-z0-9_\-]{6,}\b", "[REDACTED_WEBHOOK_SECRET]"),
        (r"\brzp_(?:live|test)_[A-Za-z0-9_\-]{6,}\b", "[REDACTED_RAZORPAY_KEY]"),
        (r"\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b", "Bearer [REDACTED_TOKEN]"),
        (r"\b[a-zA-Z0-9._\-]{3,}@(?:okaxis|okicici|oksbi|ybl|paytm|upi)\b", "[REDACTED_VPA]"),
    ]
    text = raw_text
    count = 0
    for pattern, repl in patterns:
        text, n = re.subn(pattern, repl, text)
        count += n
    return text, count
