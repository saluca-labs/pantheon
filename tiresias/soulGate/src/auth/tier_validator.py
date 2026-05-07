"""
Tier validation for SoulGate — verifies the requesting tenant's tier
allows access to the target upstream/feature.

Checks current DB tier (not token claims) to catch stale tokens
issued before a downgrade.
"""

import uuid
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

# Upstream paths that require specific minimum tiers
UPSTREAM_TIER_REQUIREMENTS: dict[str, str] = {
    "/v1/analytics": "pro",
    "/v1/detection": "pro",
    "/v1/enforcement": "enterprise",
    "/v1/integrations": "enterprise",
    "/v1/aletheia": "pro",
    "/v1/mssp": "mssp",
}

# Tier rank for comparison
TIER_RANK: dict[str, int] = {
    "community": 0,
    "starter": 1,
    "pro": 2,
    "enterprise": 3,
    "mssp": 4,
    "saas": 5,
    "owner": 6,
}


async def validate_tier_for_path(
    tenant_id: uuid.UUID,
    path: str,
    db: AsyncSession,
) -> tuple[bool, Optional[str]]:
    """
    Check if the tenant's current DB tier allows access to the given path.

    Returns:
        (allowed, reason) — allowed=True if OK, reason explains denial
    """
    # Determine required tier for this path
    required_tier = None
    for prefix, tier in UPSTREAM_TIER_REQUIREMENTS.items():
        if path.startswith(prefix):
            required_tier = tier
            break

    if required_tier is None:
        return True, None  # No tier requirement for this path

    # Lookup current tenant tier from DB
    try:
        result = await db.execute(
            text("SELECT tier, status FROM _soul_tenants WHERE id = :tid"),
            {"tid": str(tenant_id)},
        )
        row = result.first()
    except Exception as e:
        logger.warning("tier_validator.db_error", error=str(e), tenant_id=str(tenant_id))
        return True, None  # Fail open on DB errors

    if not row:
        return False, f"Tenant {tenant_id} not found"

    current_tier, status = row[0], row[1]

    # Check tenant status
    if status in ("suspended", "deactivated"):
        return False, f"Tenant is {status}"

    if status == "payment_failed":
        # Payment failed tenants are in grace period — allow but log
        logger.info("tier_validator.grace_period", tenant_id=str(tenant_id))
        return True, None

    # Check tier rank
    current_rank = TIER_RANK.get(current_tier, 0)
    required_rank = TIER_RANK.get(required_tier, 0)

    if current_rank < required_rank:
        return False, (
            f"Feature requires {required_tier} tier or higher. "
            f"Current tier: {current_tier}. Upgrade at /settings/billing"
        )

    return True, None
