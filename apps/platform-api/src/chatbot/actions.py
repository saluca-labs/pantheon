"""
Chatbot action engine.

Detects action intents from user messages and executes them against
in-process backend state. Actions return structured data that is
formatted into a natural-language response prefix.

Supported actions:
  - check_agent_status: show registered agent count and any quarantined agents
  - get_recent_alerts: show last 5 anomalies or Sigma matches
  - test_detection_rule: proxy guidance for POST /v1/detection/rules/test
  - get_dashboard_link: return the relevant dashboard URL for a topic
"""

from __future__ import annotations

import re
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Intent patterns
# ---------------------------------------------------------------------------

_INTENT_PATTERNS = [
    ("check_agent_status", [
        r"check.*agent", r"agent.*status", r"my agent", r"how many agents",
        r"list.*agent", r"show.*agent", r"agent.*count",
    ]),
    ("get_recent_alerts", [
        r"recent alert", r"latest alert", r"show alert", r"my alert",
        r"anomal", r"detection.*feed", r"what.*detected",
    ]),
    ("test_detection_rule", [
        r"test.*rule", r"rule.*test", r"test.*sigma", r"detect.*test",
    ]),
    ("get_dashboard_link", [
        r"where.*find", r"how.*navigate", r"go to", r"open.*page",
        r"dashboard.*link", r"link.*to",
    ]),
]

_DASHBOARD_LINKS = {
    "prh":        ("/dashboard/detection/prh",    "Detection > PRH"),
    "siem":       ("/dashboard/detection/siem",   "Detection > SIEM Config"),
    "rules":      ("/dashboard/detection/rules",  "Detection > Rules"),
    "playbooks":  ("/dashboard/detection/rules",  "Detection > Playbooks"),
    "quarantine": ("/dashboard/quarantine",        "Quarantine"),
    "traces":     ("/dashboard/traces",            "Observability > Traces"),
    "sessions":   ("/dashboard/sessions",          "Observability > Sessions"),
    "costs":      ("/dashboard/costs",             "Observability > Costs"),
    "providers":  ("/dashboard/providers",         "Observability > Providers"),
    "audit":      ("/dashboard/audit",             "Audit"),
    "settings":   ("/dashboard/settings",          "Settings"),
    "api keys":   ("/dashboard/settings",          "Settings > API Keys"),
    "billing":    ("/dashboard/settings",          "Settings > Billing"),
    "agents":     ("/dashboard/agents",            "Agents"),
    "overview":   ("/dashboard/overview",          "Overview"),
}


def detect_action(message: str) -> Optional[str]:
    """Return the action name if the message matches an intent, else None."""
    lower = message.lower()
    for action_name, patterns in _INTENT_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, lower):
                return action_name
    return None


async def execute_action(action: str, message: str) -> Optional[str]:
    """
    Execute an action and return a formatted result string.
    Returns None if the action fails or produces no useful output.
    """
    try:
        if action == "check_agent_status":
            return await _check_agent_status()
        elif action == "get_recent_alerts":
            return await _get_recent_alerts()
        elif action == "test_detection_rule":
            return _get_test_rule_guidance()
        elif action == "get_dashboard_link":
            return _get_dashboard_link(message)
        return None
    except Exception as exc:
        logger.warning("chatbot.action_failed", action=action, error=str(exc))
        return None


async def _check_agent_status() -> str:
    lines = ["Here is your current agent status:"]
    try:
        from src.analytics._state import get_analytics_state  # type: ignore[import]
        state = get_analytics_state()
        if state and hasattr(state, "baseline_engine"):
            baselines = getattr(state.baseline_engine, "_baselines", {})
            lines.append(f"- Registered agents: {len(baselines)}")
            if baselines:
                sample = list(baselines.keys())[:3]
                lines.append(f"- Sample agent IDs: {', '.join(sample)}")
        else:
            lines.append("- Agent baseline engine not available.")
    except Exception:
        lines.append("- Agent data unavailable.")

    try:
        from src.enforcement import quarantine as qmod  # type: ignore[import]
        quarantined = getattr(qmod, "_quarantined", {})
        lines.append(f"- Quarantined agents: {len(quarantined)}")
        if quarantined:
            lines.append("  Go to Quarantine in the dashboard to review them.")
    except Exception:
        pass

    lines.append("\nView full agent list at Agents in the dashboard.")
    return "\n".join(lines)


async def _get_recent_alerts() -> str:
    lines = ["Here are your recent alerts:"]
    found = False

    try:
        from src.analytics._state import get_analytics_state  # type: ignore[import]
        state = get_analytics_state()
        if state and hasattr(state, "alert_router"):
            recent = getattr(state.alert_router, "_recent_alerts", [])[-5:]
            if recent:
                found = True
                for alert in recent:
                    alert_type = alert.get("type", "unknown")
                    severity = alert.get("severity", "?")
                    lines.append(f"- [{severity.upper()}] {alert_type}")
    except Exception:
        pass

    if not found:
        lines.append("- No recent alerts found in memory.")
        lines.append("  Check Detection > Detection Feed in the dashboard for the full alert history.")
    else:
        lines.append("\nView all alerts at Detection > Detection Feed in the dashboard.")

    return "\n".join(lines)


def _get_test_rule_guidance() -> str:
    return (
        "To test a detection rule:\n"
        "1. Go to Detection > Rules in the dashboard.\n"
        "2. Click on a rule to open the editor.\n"
        "3. In the Test Panel, paste a sample event JSON and click Run Test.\n"
        "4. You will see whether the rule matched and which fields triggered it.\n\n"
        "You can also use the API directly:\n"
        "POST /v1/detection/rules/test\n"
        'Body: {"rule_id": "your-rule-id", "event": {"model": "gpt-4o", "tokens": 5000}}'
    )


def _get_dashboard_link(message: str) -> Optional[str]:
    lower = message.lower()
    for keyword, (path, label) in _DASHBOARD_LINKS.items():
        if keyword in lower:
            return f"You can find that at {label} in the dashboard (path: {path})."
    return None
