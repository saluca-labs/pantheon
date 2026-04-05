"""
Action policy engine — monitor-only stub.

In production this will load tenant-specific YAML policies from the
policy repo and evaluate them against inbound actions.  For now it
always permits, logging the decision for audit.
"""

import structlog

from soulGate.src.actions.models import (
    PolicyDecision,
    TiresiasActionRequest,
)

logger = structlog.get_logger(__name__)


async def evaluate_action(request: TiresiasActionRequest) -> PolicyDecision:
    """
    Evaluate an action request against the active policy set.

    Current behaviour: monitor-only (always permit).
    Future: load tenant policies from DB / git-synced YAML, evaluate
    rules in priority order, return first deny or default permit.
    """
    logger.info(
        "policy.evaluate",
        action_id=str(request.action_id),
        action_type=request.action_type.value,
        persona_id=request.persona_id,
        target_platform=request.target_platform,
        target_channel=request.target_channel,
        simulation=request.simulation,
        decision="permit",
    )
    return PolicyDecision(allowed=True)
