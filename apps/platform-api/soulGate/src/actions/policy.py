"""
Action policy evaluator.
Currently operates in monitor-only mode (always permits).
Enforcement logic plugs in here when policy engine is ready.
"""

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.auth.token_validator import AuthResult
from soulGate.src.actions.models import TiresiasActionRequest, PolicyDecision

logger = structlog.get_logger(__name__)


async def evaluate_action(
    auth: AuthResult,
    action: TiresiasActionRequest,
    db: AsyncSession,
) -> PolicyDecision:
    """
    Evaluate whether an action should be permitted.

    Monitor mode: always permit, log everything.
    When enforcement is enabled, this function will query tenant-level
    and persona-level policy rules from the database and return deny
    decisions with full DenialInfo context.
    """
    logger.debug(
        "action_policy.evaluate",
        action_id=str(action.action_id),
        action_type=action.action_type.value,
        persona_id=action.persona_id,
        tenant_id=action.tenant_id,
        target_platform=action.target.platform,
        target_channel=action.target.channel,
    )

    # --- Monitor-only mode ---
    # All actions are permitted. The audit log captures every decision
    # so operators can review before flipping to enforcement.
    return PolicyDecision(allowed=True, reason="monitor-only")
