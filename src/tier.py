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


# ---------------------------------------------------------------------------
# Tier-based child creation rules (tenant hierarchy)
# ---------------------------------------------------------------------------

TIER_ALLOWED_CHILDREN: dict[str, list[str]] = {
    "saas": ["saas", "mssp", "enterprise", "pro", "starter", "community"],
    "mssp": ["enterprise", "pro", "starter", "community"],
    "enterprise": ["pro", "starter", "community"],
    "pro": ["starter", "community"],
    "community": [],
    "starter": [],
}

TIER_MAX_CHILDREN: dict[str, int] = {
    "saas": 0,       # 0 = unlimited
    "mssp": 500,
    "enterprise": 50,
    "pro": 10,
    "community": 0,
    "starter": 0,
}


def can_create_child(parent_tier: str, child_tier: str) -> bool:
    """Check whether a parent tier is allowed to create a child of the given tier."""
    return child_tier in TIER_ALLOWED_CHILDREN.get(parent_tier, [])
