"""
Canonical tier definitions for Tiresias platform.
Single source of truth — all modules import from here.
"""
from enum import Enum


class Tier(str, Enum):
    """Tier levels in ascending order of capability."""
    COMMUNITY = "community"
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    MSSP = "mssp"
    SAAS = "saas"


# Ordered list for rank comparisons (index = rank, higher = more capable)
TIER_ORDER: list[str] = [t.value for t in Tier]

VALID_TIERS: set[str] = {t.value for t in Tier}

DEFAULT_TIER: str = Tier.COMMUNITY.value


def tier_rank(tier: str) -> int:
    """Return numeric rank for a tier string. Unknown tiers rank as 0 (community)."""
    try:
        return TIER_ORDER.index(tier)
    except ValueError:
        return 0


def effective_tier(install_tier: str, tenant_tier: str) -> str:
    """
    Compute effective tier = min(install_license_tier, tenant_subscription_tier).
    Install license caps the ceiling; tenant subscription sets what they paid for.
    """
    return TIER_ORDER[min(tier_rank(install_tier), tier_rank(tenant_tier))]
