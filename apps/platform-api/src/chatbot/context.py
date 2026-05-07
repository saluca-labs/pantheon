"""
Customer context injection for the chatbot.

Fetches tier, agent count, and recent alert count from in-process state.
Never raises -- returns best-effort context string for the LLM system prompt.
"""

from __future__ import annotations

from typing import Optional

import structlog
from fastapi import Request

logger = structlog.get_logger(__name__)


async def build_customer_context(request: Request) -> str:
    """
    Build a compact context block for the LLM system prompt.
    Sources: app.state.license (tier), request.state (tenant_id),
    analytics._state (agent count, recent alerts).
    """
    lines: list[str] = []

    # Tier
    try:
        license_state = getattr(request.app.state, "license", None)
        tier = license_state.tier if license_state else "unknown"
        lines.append(f"Customer tier: {tier}")
    except Exception:
        lines.append("Customer tier: unknown")

    # Tenant ID
    tenant_id: Optional[str] = getattr(getattr(request, "state", None), "tenant_id", None)
    if tenant_id:
        lines.append(f"Tenant ID: {tenant_id}")

    # Agent count from baseline engine
    try:
        from src.analytics._state import get_analytics_state  # type: ignore[import]
        state = get_analytics_state()
        if state and hasattr(state, "baseline_engine"):
            agent_count = len(getattr(state.baseline_engine, "_baselines", {}))
            lines.append(f"Registered agents: {agent_count}")
    except Exception:
        pass

    # Recent alerts (last 24h)
    try:
        from src.analytics._state import get_analytics_state  # type: ignore[import]
        state = get_analytics_state()
        if state and hasattr(state, "alert_router"):
            recent = getattr(state.alert_router, "_recent_alerts", [])
            lines.append(f"Recent alerts (24h): {len(recent)}")
    except Exception:
        pass

    return "\n".join(lines) if lines else "Customer context unavailable."
