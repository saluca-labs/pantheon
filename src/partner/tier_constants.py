"""
Partner tier constraint constants.
Single source of truth for what partners can and cannot do with sub-tenant tiers.

Used by tier_enforcement.py (FastAPI dependency) and tests.
"""

from collections import OrderedDict

# Tiers that partners can assign to sub-tenants
ALLOWED_SUBTENANT_TIERS: frozenset[str] = frozenset({
    "community", "starter", "pro", "enterprise"
})

# Tiers that are NEVER allowed for sub-tenants under a partner (hard block)
BLOCKED_SUBTENANT_TIERS: frozenset[str] = frozenset({
    "mssp", "saas"
})

# Maximum hierarchy depth below a partner root tenant.
# 1 = flat children only (partner -> child, no deeper nesting).
MAX_HIERARCHY_DEPTH: int = 1

# Ordered mapping of tier names to numeric levels for rank comparison.
# Higher number = more capable tier.
TIER_HIERARCHY: OrderedDict[str, int] = OrderedDict([
    ("community", 0),
    ("starter", 1),
    ("pro", 2),
    ("enterprise", 3),
    ("mssp", 4),
    ("saas", 5),
])

# Constraint ID constants for audit trail
TC_01_BLOCKED_CHILD_TIER = "TC-01-BLOCKED_CHILD_TIER"
TC_02_PARTNER_PROVISION_BLOCKED = "TC-02-PARTNER_PROVISION_BLOCKED_TIER"
TC_03_DEPTH_EXCEEDED = "TC-03-DEPTH_EXCEEDED"
TC_04_UPGRADE_BLOCKED = "TC-04-UPGRADE_BLOCKED"
TC_05_UI_FILTER = "TC-05-UI_FILTER"  # cosmetic only
TC_06_WEBHOOK_TIER_BLOCKED = "TC-06-WEBHOOK_TIER_BLOCKED"

# Event types for audit log
AUDIT_EVENT_CONSTRAINT_VIOLATION = "tier_guard.constraint_violation"
AUDIT_EVENT_WEBHOOK_VIOLATION = "tier_guard.webhook_constraint_violation"


def validate_subtenant_tier(requested_tier: str) -> bool:
    """
    Return True if the requested tier is allowed for a partner sub-tenant.
    Only tiers in ALLOWED_SUBTENANT_TIERS pass; empty, unknown, or blocked
    tiers return False.
    """
    if not requested_tier:
        return False
    return requested_tier.lower() in ALLOWED_SUBTENANT_TIERS


def validate_hierarchy_depth(current_depth: int) -> bool:
    """
    Return True if a new child can be created at the given parent depth.
    The child would be at current_depth + 1, which must not exceed MAX_HIERARCHY_DEPTH.
    A partner at depth 0 can create children at depth 1. A sub-tenant at depth 1 cannot.
    """
    return current_depth < MAX_HIERARCHY_DEPTH


def validate_tier_upgrade(
    current_tier: str,
    requested_tier: str,
    is_partner_subtenant: bool,
) -> bool:
    """
    Return True if the tier upgrade is allowed.

    For partner sub-tenants, upgrades to mssp/saas are always blocked.
    For all tenants, the requested tier must exist in TIER_HIERARCHY
    and have a higher rank than the current tier.
    """
    if not requested_tier:
        return False

    requested_lower = requested_tier.lower()

    # Partner sub-tenants cannot upgrade to blocked tiers
    if is_partner_subtenant and requested_lower in BLOCKED_SUBTENANT_TIERS:
        return False

    # Both tiers must be known
    current_rank = TIER_HIERARCHY.get(current_tier.lower() if current_tier else "")
    requested_rank = TIER_HIERARCHY.get(requested_lower)

    if current_rank is None or requested_rank is None:
        return False

    # Upgrade must be to a higher tier
    return requested_rank > current_rank
