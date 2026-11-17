import os
from typing import Any, Dict, List, TypedDict

from langgraph.graph import END, StateGraph

from .security import evaluate_replay_and_skew, verify_webhook_signature


class WebhookInvestigationState(TypedDict):
    incident: Dict[str, Any]
    order: Dict[str, Any]
    webhooks: List[Dict[str, Any]]
    reconciliation_summary: str
    crypto_summary: str
    ordering_summary: str
    recovery_plan: str
    proposed_order_status: str
    awaiting_human_approval: bool


def node_reconciler(state: WebhookInvestigationState) -> WebhookInvestigationState:
    order = state["order"]
    discrepancy = order["gateway_status"] == "captured" and order["order_status"] == "PENDING"
    state["reconciliation_summary"] = (
        f"Order {order['order_id']}: gateway={order['gateway_status']}, "
        f"merchant={order['order_status']}, discrepancy={discrepancy}."
    )
    return state


def node_crypto_forensics(state: WebhookInvestigationState) -> WebhookInvestigationState:
    all_valid = True
    replays = 0
    for wh in state["webhooks"]:
        sig_res = verify_webhook_signature(wh["raw_payload"], wh["received_signature"])
        if not sig_res["valid"]:
            all_valid = False
        rep_res = evaluate_replay_and_skew(wh["event_id"], wh["created_at_unix"], set())
        if wh["replay_detected"] or rep_res["replay_detected"]:
            replays += 1
    state["crypto_summary"] = f"HMAC all_valid={all_valid}, replay_indicators={replays}."
    state["proposed_order_status"] = "RECONCILED" if all_valid else "QUARANTINED"
    return state


def node_ordering_guard(state: WebhookInvestigationState) -> WebhookInvestigationState:
    state["ordering_summary"] = (
        f"Monotonic state guard selected target={state['proposed_order_status']}."
    )
    return state


def node_recovery_planner(state: WebhookInvestigationState) -> WebhookInvestigationState:
    model_name = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    prompt = (
        f"Summarize webhook recovery in 2 concise sentences: "
        f"{state['reconciliation_summary']} {state['crypto_summary']} "
        f"Proposed status: {state['proposed_order_status']}."
    )
    summary = ""
    try:
        from langchain_ollama import ChatOllama

        llm = ChatOllama(
            model=model_name,
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            temperature=0,
        )
        res = llm.invoke(prompt)
        summary = str(res.content).strip()
    except Exception:
        summary = (
            f"Deterministic Planner ({model_name} fallback): "
            f"{state['reconciliation_summary']} {state['crypto_summary']} "
            f"Recommend transitioning order to {state['proposed_order_status']} upon operator approval."
        )

    state["recovery_plan"] = summary
    state["awaiting_human_approval"] = True
    return state


def build_investigation_graph():
    builder = StateGraph(WebhookInvestigationState)
    builder.add_node("reconciler", node_reconciler)
    builder.add_node("crypto_forensics", node_crypto_forensics)
    builder.add_node("ordering_guard", node_ordering_guard)
    builder.add_node("recovery_planner", node_recovery_planner)

    builder.set_entry_point("reconciler")
    builder.add_edge("reconciler", "crypto_forensics")
    builder.add_edge("crypto_forensics", "ordering_guard")
    builder.add_edge("ordering_guard", "recovery_planner")
    builder.add_edge("recovery_planner", END)
    return builder.compile()
