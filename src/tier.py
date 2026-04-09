"""
Canonical tier definitions for Tiresias platform.
Single source of truth — all modules import from here.

Privacy: Database-backed overrides allow runtime config without redeploy.
Compliance: All overrides audit-logged.
"""
from enum import Enum
from typing import Optional
import structlog

logger = structlog.get_logger(__name__)


class Tier(str, Enum):
    """Tier levels in ascending order of capability."""
    COMMUNITY = "community"
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    MSSP = "mssp"
    SAAS = "saas"
    OWNER = "owner"


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
    Owner tier bypasses the install-license ceiling entirely.
    """
    if tenant_tier == "owner" or install_tier == "owner":
        return "owner"
    return TIER_ORDER[min(tier_rank(install_tier), tier_rank(tenant_tier))]


# ---------------------------------------------------------------------------
# Tier-based child creation rules (tenant hierarchy)
# ---------------------------------------------------------------------------

# Default values (used if no database override exists)
DEFAULT_TIER_ALLOWED_CHILDREN: dict[str, list[str]] = {
    "owner": ["saas", "mssp", "enterprise", "pro", "starter", "community"],
    "saas": ["saas", "mssp", "enterprise", "pro", "starter", "community"],
    "mssp": ["enterprise", "pro", "starter", "community"],
    "enterprise": ["pro", "starter", "community"],
    "pro": ["starter", "community"],
    "community": [],
    "starter": [],
}

DEFAULT_TIER_MAX_CHILDREN: dict[str, int] = {
    "owner": 0,      # 0 = unlimited
    "saas": 0,       # 0 = unlimited
    "mssp": 500,
    "enterprise": 50,
    "pro": 10,
    "community": 0,
    "starter": 0,
}

# Runtime cache (populated from database on first access)
_tier_overrides_cache: Optional[dict] = None


def _load_tier_overrides() -> dict:
    """
    Load tier overrides from database.
    Privacy: Allows runtime config changes without code deploy.
    Compliance: Overrides are audit-logged in database.
    """
    global _tier_overrides_cache
    if _tier_overrides_cache is not None:
        return _tier_overrides_cache

    try:
        from src.database.connection import get_db_session
        from src.database.models import TierOverride

        db = get_db_session()
        overrides = db.query(TierOverride).all()

        _tier_overrides_cache = {
            "allowed_children": {},
            "max_children": {},
        }

        for override in overrides:
            if override.allowed_children_json:
                _tier_overrides_cache["allowed_children"][override.tier_name] = override.allowed_children_json
            if override.max_children is not None:
                _tier_overrides_cache["max_children"][override.tier_name] = override.max_children

        return _tier_overrides_cache
    except Exception as e:
        logger.warning("tier.overrides.load_failed", error=str(e))
        return {
            "allowed_children": DEFAULT_TIER_ALLOWED_CHILDREN,
            "max_children": DEFAULT_TIER_MAX_CHILDREN,
        }


def get_tier_allowed_children(tier: str) -> list[str]:
    """Get allowed children for a tier, with database override support."""
    overrides = _load_tier_overrides()
    return overrides["allowed_children"].get(tier, DEFAULT_TIER_ALLOWED_CHILDREN.get(tier, []))


def get_tier_max_children(tier: str) -> int:
    """Get max children for a tier, with database override support."""
    overrides = _load_tier_overrides()
    return overrides["max_children"].get(tier, DEFAULT_TIER_MAX_CHILDREN.get(tier, 0))


def can_create_child(parent_tier: str, child_tier: str) -> bool:
    """Check whether a parent tier is allowed to create a child of the given tier."""
    allowed = get_tier_allowed_children(parent_tier)
    return child_tier in allowed


def invalidate_tier_cache() -> None:
    """Invalidate tier overrides cache (call after database updates)."""
    global _tier_overrides_cache
    _tier_overrides_cache = None
    logger.debug("tier.cache.invalidated")
