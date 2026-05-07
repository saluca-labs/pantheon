"""
Tests for User-Agent Relationship Access Control.
Validates that agent data access is correctly scoped by human user identity.
"""

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from src.auth.user_context import (
    UserContext,
    RelationshipType,
    apply_user_context,
    evaluate_user_context_rules,
    clearance_allows,
    CLEARANCE_LEVELS,
    CLEARANCE_ORDER,
)
from src.database.models import Soulkey, SoulTenant, PolicyCache
from src.auth.pdp import evaluate as pdp_evaluate
from src.tokens.capability import validate_capability_token


@pytest_asyncio.fixture
async def pdp_setup(db_session):
    """Set up tenant, soulkey, and policy for PDP user-context tests."""
    tenant = SoulTenant(
        id=uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        name="UserCtx Corp",
        slug="uctx",
        tier="enterprise",
        status="active",
    )
    db_session.add(tenant)
    await db_session.flush()

    sk = Soulkey(
        id=uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
        tenant_id=tenant.id,
        persona_id="chatbot",
        key_hash="fakehash_userctx_test",
        label="User context test key",
        status="active",
    )
    db_session.add(sk)
    await db_session.flush()

    # Policy that has user_context_rules
    policy_data = {
        "metadata": {
            "tenant": "uctx",
            "persona": "chatbot",
            "role": "domain_specialist",
            "description": "HR chatbot",
        },
        "spec": {
            "jit": {
                "max_capability_ttl": 300,
                "default_capability_ttl": 120,
                "require_active_session": False,
                "allowed_nodes": ["*"],
                "operating_window": "24/7",
                "max_concurrent_capabilities": 10,
            },
            "escalation": {
                "can_grant_temporary_access": False,
                "can_suspend_agents": False,
                "approval_required_for": [],
            },
            "resources": {
                "customer_data": [
                    {
                        "actions": ["read", "write"],
                        "scopes": ["*"],
                        "nodes": ["*"],
                        "services": ["*"],
                        "conditions": [
                            {
                                "user_context_rules": [
                                    {"user_clearance": "restricted", "allowed_actions": ["read", "write"]},
                                    {"user_clearance": "confidential", "allowed_actions": ["read"]},
                                    {"user_clearance": "internal", "allowed_actions": []},
                                ]
                            }
                        ],
                    }
                ],
                "public_data": [
                    {
                        "actions": ["read", "write"],
                        "scopes": ["*"],
                        "nodes": ["*"],
                        "services": ["*"],
                        "conditions": [],
                    }
                ],
            },
        },
    }

    cache = PolicyCache(
        tenant_id=tenant.id,
        persona_id="chatbot",
        policy_version="test",
        resolved_policy=policy_data,
    )
    db_session.add(cache)
    await db_session.flush()

    return tenant, sk, "fakehash_userctx_test"


# ---------------------------------------------------------------------------
# Test 1: UserContext from_dict
# ---------------------------------------------------------------------------
def test_user_context_from_dict():
    uc = UserContext.from_dict({
        "user_id": "u-123",
        "user_role": "hr_vp",
        "user_department": "human_resources",
        "user_clearance": "restricted",
        "relationship_type": "owner",
    })
    assert uc.user_id == "u-123"
    assert uc.user_clearance == "restricted"
    assert uc.relationship_type == "owner"


def test_user_context_from_dict_requires_user_id():
    with pytest.raises(ValueError):
        UserContext.from_dict({})
    with pytest.raises(ValueError):
        UserContext.from_dict({"user_role": "intern"})


# ---------------------------------------------------------------------------
# Test 2: Clearance-based data scoping
# ---------------------------------------------------------------------------
def test_clearance_allows():
    assert clearance_allows("restricted", "restricted") is True
    assert clearance_allows("restricted", "public") is True
    assert clearance_allows("public", "restricted") is False
    assert clearance_allows("internal", "confidential") is False
    assert clearance_allows("confidential", "confidential") is True


# ---------------------------------------------------------------------------
# Test 3: Agent can't exceed user's clearance (via user_context_rules)
# ---------------------------------------------------------------------------
def test_user_context_rules_restrict_actions():
    uc = UserContext(user_id="u-1", user_clearance="internal")
    rules = [
        {"user_clearance": "restricted", "allowed_actions": ["read", "write"]},
        {"user_clearance": "confidential", "allowed_actions": ["read"]},
        {"user_clearance": "internal", "allowed_actions": []},
    ]

    result = evaluate_user_context_rules(uc, rules, "read")
    assert result == []  # internal gets no access


def test_user_context_rules_confidential_read_only():
    uc = UserContext(user_id="u-2", user_clearance="confidential")
    rules = [
        {"user_clearance": "restricted", "allowed_actions": ["read", "write"]},
        {"user_clearance": "confidential", "allowed_actions": ["read"]},
        {"user_clearance": "internal", "allowed_actions": []},
    ]

    result = evaluate_user_context_rules(uc, rules, "write")
    assert result == ["read"]  # confidential only gets read


def test_user_context_rules_restricted_full_access():
    uc = UserContext(user_id="u-3", user_clearance="restricted")
    rules = [
        {"user_clearance": "restricted", "allowed_actions": ["read", "write"]},
        {"user_clearance": "confidential", "allowed_actions": ["read"]},
    ]

    result = evaluate_user_context_rules(uc, rules, "write")
    assert result == ["read", "write"]


# ---------------------------------------------------------------------------
# Test 4: User-agent relationship types
# ---------------------------------------------------------------------------
def test_apply_user_context_owner_full_access():
    uc = UserContext(user_id="u-owner", user_clearance="restricted", relationship_type="owner")
    actions, claims = apply_user_context(uc, ["read", "write", "delete"])
    assert actions == ["read", "write", "delete"]
    assert claims["uid"] == "u-owner"
    assert claims["ucl"] == "restricted"


def test_apply_user_context_guest_read_only():
    uc = UserContext(user_id="u-guest", user_clearance="restricted", relationship_type="guest")
    actions, claims = apply_user_context(uc, ["read", "write", "delete"])
    assert actions == ["read"]
    assert claims["urt"] == "guest"


def test_apply_user_context_auditor_read_only():
    uc = UserContext(user_id="u-audit", user_clearance="restricted", relationship_type="auditor")
    actions, claims = apply_user_context(uc, ["read", "write"])
    assert actions == ["read"]


# ---------------------------------------------------------------------------
# Test 5: Capability token includes user claims (uid, ucl)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_pdp_with_user_context_adds_claims(db_session, pdp_setup):
    """When user_context is provided, capability token should contain uid and ucl."""
    tenant, sk, key_hash = pdp_setup

    # We need the raw key — but we have the hash. For this test,
    # we'll patch resolve_identity to return our soulkey directly.
    from unittest.mock import AsyncMock, patch

    with patch("src.auth.pdp.resolve_identity", new_callable=AsyncMock, return_value=sk):
        decision = await pdp_evaluate(
            db=db_session,
            raw_soulkey="fake_raw_key",
            resource="public_data",
            action="read",
            scope="*",
            context={},
            user_context={
                "user_id": "u-vp",
                "user_clearance": "restricted",
                "relationship_type": "user",
            },
        )

    assert decision.decision == "grant"
    assert decision.capability_token is not None

    # Decode the token and check claims
    claims = validate_capability_token(decision.capability_token)
    assert claims["uid"] == "u-vp"
    assert claims["ucl"] == "restricted"


# ---------------------------------------------------------------------------
# Test 6: Policy with user_context_rules denies write for confidential user
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_pdp_user_context_denies_write(db_session, pdp_setup):
    """A confidential-clearance user should be denied write on customer_data."""
    tenant, sk, key_hash = pdp_setup

    from unittest.mock import AsyncMock, patch

    with patch("src.auth.pdp.resolve_identity", new_callable=AsyncMock, return_value=sk):
        decision = await pdp_evaluate(
            db=db_session,
            raw_soulkey="fake_raw_key",
            resource="customer_data",
            action="write",
            scope="*",
            context={},
            user_context={
                "user_id": "u-mid",
                "user_clearance": "confidential",
                "relationship_type": "user",
            },
        )

    assert decision.decision == "deny"
    assert "user context restricts" in decision.reason


# ---------------------------------------------------------------------------
# Test 7: Evaluation without user context is backward compatible
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_pdp_without_user_context(db_session, pdp_setup):
    """Without user_context, the PDP should behave exactly as before."""
    tenant, sk, key_hash = pdp_setup

    from unittest.mock import AsyncMock, patch

    with patch("src.auth.pdp.resolve_identity", new_callable=AsyncMock, return_value=sk):
        decision = await pdp_evaluate(
            db=db_session,
            raw_soulkey="fake_raw_key",
            resource="customer_data",
            action="write",
            scope="*",
            context={},
            user_context=None,
        )

    assert decision.decision == "grant"


# ---------------------------------------------------------------------------
# Test 8: Audit trail includes user context
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_audit_trail_includes_user_context(db_session, pdp_setup):
    tenant, sk, key_hash = pdp_setup

    from unittest.mock import AsyncMock, patch
    from src.database.models import AuditLog
    from sqlalchemy import select

    with patch("src.auth.pdp.resolve_identity", new_callable=AsyncMock, return_value=sk):
        decision = await pdp_evaluate(
            db=db_session,
            raw_soulkey="fake_raw_key",
            resource="public_data",
            action="read",
            scope="*",
            context={},
            user_context={
                "user_id": "u-audit-test",
                "user_clearance": "internal",
                "relationship_type": "user",
            },
        )

    assert decision.decision == "grant"

    # Check audit log
    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.event_type == "auth_grant",
            AuditLog.soulkey_id == sk.id,
        ).order_by(AuditLog.timestamp.desc())
    )
    log_entry = result.scalars().first()
    assert log_entry is not None
    assert log_entry.context.get("user_context", {}).get("user_id") == "u-audit-test"


# ---------------------------------------------------------------------------
# Test 9: No user_context_rules in policy — user_context still adds claims
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_user_context_no_rules_still_adds_claims(db_session, pdp_setup):
    """Even without user_context_rules, the token gets uid/ucl claims."""
    tenant, sk, key_hash = pdp_setup

    from unittest.mock import AsyncMock, patch

    with patch("src.auth.pdp.resolve_identity", new_callable=AsyncMock, return_value=sk):
        decision = await pdp_evaluate(
            db=db_session,
            raw_soulkey="fake_raw_key",
            resource="public_data",  # no user_context_rules on this resource
            action="write",
            scope="*",
            context={},
            user_context={
                "user_id": "u-norules",
                "user_clearance": "public",
                "relationship_type": "user",
            },
        )

    assert decision.decision == "grant"
    claims = validate_capability_token(decision.capability_token)
    assert claims["uid"] == "u-norules"
    assert claims["ucl"] == "public"


# ---------------------------------------------------------------------------
# Test 10: apply_user_context intersects relationship + rules
# ---------------------------------------------------------------------------
def test_apply_user_context_double_restriction():
    """Guest relationship AND user_context_rules should both apply."""
    uc = UserContext(
        user_id="u-double",
        user_clearance="restricted",
        relationship_type="guest",
    )
    rules = [
        {"user_clearance": "restricted", "allowed_actions": ["read", "write"]},
    ]
    actions, claims = apply_user_context(
        uc, ["read", "write", "delete"],
        resource_user_rules=rules,
        requested_action="write",
    )
    # Guest restricts to ["read"], rules allow ["read", "write"]
    # Intersection of guest-filtered ["read"] with rules ["read", "write"] = ["read"]
    assert actions == ["read"]


# ---------------------------------------------------------------------------
# Test 11: Clearance level ordering
# ---------------------------------------------------------------------------
def test_clearance_order():
    assert CLEARANCE_ORDER["public"] < CLEARANCE_ORDER["internal"]
    assert CLEARANCE_ORDER["internal"] < CLEARANCE_ORDER["confidential"]
    assert CLEARANCE_ORDER["confidential"] < CLEARANCE_ORDER["restricted"]


# ---------------------------------------------------------------------------
# Test 12: Empty user_context_rules returns None (no restriction)
# ---------------------------------------------------------------------------
def test_empty_user_context_rules():
    uc = UserContext(user_id="u-empty", user_clearance="public")
    result = evaluate_user_context_rules(uc, [], "read")
    assert result is None
