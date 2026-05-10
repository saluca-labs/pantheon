"""
Unit tests for src/tier.py canonical tier helpers.

Covers tier_meets() rank-comparison semantics, including the owner-superuser
short-circuit. Mirrors the frontend tierMeets() helper in
portal/src/components/dashboard/TierGate.tsx.
"""

from src.tier import tier_meets, tier_rank, TIER_ORDER


# ---------------------------------------------------------------------------
# tier_meets() -- owner is a superuser tier
# ---------------------------------------------------------------------------

def test_tier_meets_owner_meets_owner():
    assert tier_meets("owner", "owner") is True


def test_tier_meets_owner_meets_saas():
    assert tier_meets("owner", "saas") is True


def test_tier_meets_owner_meets_mssp():
    assert tier_meets("owner", "mssp") is True


def test_tier_meets_owner_meets_community():
    assert tier_meets("owner", "community") is True


# ---------------------------------------------------------------------------
# tier_meets() -- equal tiers
# ---------------------------------------------------------------------------

def test_tier_meets_mssp_meets_mssp():
    assert tier_meets("mssp", "mssp") is True


def test_tier_meets_saas_meets_saas():
    assert tier_meets("saas", "saas") is True


def test_tier_meets_community_meets_community():
    assert tier_meets("community", "community") is True


# ---------------------------------------------------------------------------
# tier_meets() -- higher rank meets lower requirement
# ---------------------------------------------------------------------------

def test_tier_meets_saas_meets_mssp():
    assert tier_meets("saas", "mssp") is True


def test_tier_meets_enterprise_meets_pro():
    assert tier_meets("enterprise", "pro") is True


# ---------------------------------------------------------------------------
# tier_meets() -- lower rank does NOT meet higher requirement
# ---------------------------------------------------------------------------

def test_tier_meets_community_does_not_meet_mssp():
    assert tier_meets("community", "mssp") is False


def test_tier_meets_pro_does_not_meet_mssp():
    assert tier_meets("pro", "mssp") is False


def test_tier_meets_enterprise_does_not_meet_saas():
    assert tier_meets("enterprise", "saas") is False


# ---------------------------------------------------------------------------
# tier_meets() -- unknown tiers fail closed against real requirements
# ---------------------------------------------------------------------------

def test_tier_meets_unknown_actual_against_mssp_returns_false():
    # Unknown actual tier falls back to community (rank 0); cannot meet mssp.
    assert tier_meets("garbage", "mssp") is False


def test_tier_meets_unknown_required_returns_false_for_non_owner():
    # Unknown required tier fails closed for ordinary tiers.
    assert tier_meets("saas", "garbage") is False
    assert tier_meets("community", "garbage") is False


def test_tier_meets_owner_bypasses_unknown_required():
    # Mirrors frontend semantics: owner short-circuits before required-tier
    # validation, so it passes even unknown tiers (defense in depth: owner is
    # already the highest-trust caller).
    assert tier_meets("owner", "garbage") is True


def test_tier_meets_empty_actual_against_mssp_returns_false():
    assert tier_meets("", "mssp") is False


# ---------------------------------------------------------------------------
# Sanity: TIER_ORDER ordering matches expectations consumed elsewhere
# ---------------------------------------------------------------------------

def test_tier_order_is_ascending_capability():
    assert tier_rank("community") < tier_rank("mssp")
    assert tier_rank("mssp") < tier_rank("saas")
    assert tier_rank("saas") < tier_rank("owner")
    assert TIER_ORDER[-1] == "owner"
