"""
Tests for delegation and escalation workflows.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from src.auth.delegation import (
    create_delegation,
    revoke_delegation,
    check_delegation,
    list_active_delegations,
    cleanup_expired_delegations,
    MAX_DELEGATION_TTL,
)
from src.auth.soulkey import issue_soulkey


class TestDelegationCreation:
    """Tests for creating delegations."""

    @pytest.mark.asyncio
    async def test_create_delegation(self, db_session, sample_tenant, sample_policy_cache):
        """Create a temporary delegation."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        delegation = await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="oracle",
            resource="memory",
            action="write",
            scope="business:*",
            ttl=300,
            reason="Temporary access for project",
        )

        assert delegation is not None
        assert delegation.grantee_persona == "oracle"
        assert delegation.resource == "memory"
        assert delegation.action == "write"
        assert delegation.scope == "business:*"
        assert delegation.revoked_at is None
        exp = delegation.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_delegation_ttl_limit(self, db_session, sample_tenant, sample_policy_cache):
        """Delegation cannot exceed max TTL."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        with pytest.raises(ValueError, match="cannot exceed"):
            await create_delegation(
                db_session,
                grantor_soulkey=soulkey,
                grantee_persona="oracle",
                resource="memory",
                action="write",
                scope="*",
                ttl=MAX_DELEGATION_TTL + 1,
                reason="Too long",
            )

    @pytest.mark.asyncio
    async def test_delegation_ttl_must_be_positive(self, db_session, sample_tenant, sample_policy_cache):
        """Delegation TTL must be positive."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        with pytest.raises(ValueError, match="must be positive"):
            await create_delegation(
                db_session,
                grantor_soulkey=soulkey,
                grantee_persona="oracle",
                resource="memory",
                action="write",
                scope="*",
                ttl=0,
                reason="Zero TTL",
            )


class TestDelegationRevocation:
    """Tests for revoking delegations."""

    @pytest.mark.asyncio
    async def test_revoke_delegation(self, db_session, sample_tenant, sample_policy_cache):
        """Revoke an active delegation."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        delegation = await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="oracle",
            resource="vault",
            action="read",
            scope="*",
            ttl=600,
            reason="Temp access",
        )
        await db_session.flush()

        result = await revoke_delegation(db_session, delegation.id, "alfred")
        assert result is not None
        assert result.revoked_at is not None
        assert result.revoked_by == "alfred"

    @pytest.mark.asyncio
    async def test_revoke_nonexistent(self, db_session):
        """Revoking non-existent delegation returns None."""
        result = await revoke_delegation(
            db_session,
            uuid.UUID("99999999-9999-9999-9999-999999999999"),
            "admin",
        )
        assert result is None


class TestDelegationCheck:
    """Tests for checking active delegations in PDP flow."""

    @pytest.mark.asyncio
    async def test_check_active_delegation(self, db_session, sample_tenant, sample_policy_cache):
        """Active delegation is found for matching request."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="oracle",
            resource="vault",
            action="read",
            scope="*",
            ttl=600,
            reason="Check test",
        )
        await db_session.flush()

        result = await check_delegation(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="oracle",
            resource="vault",
            action="read",
            scope="OPENAI_API_KEY",
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_check_no_delegation(self, db_session, sample_tenant):
        """No delegation found for unmatched request."""
        result = await check_delegation(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="oracle",
            resource="mesh",
            action="ssh",
            scope="ai-lab",
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_check_revoked_delegation_not_found(self, db_session, sample_tenant, sample_policy_cache):
        """Revoked delegation is not returned."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        delegation = await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="robin",
            resource="memory",
            action="write",
            scope="*",
            ttl=600,
            reason="Will be revoked",
        )
        await db_session.flush()

        await revoke_delegation(db_session, delegation.id, "alfred")
        await db_session.flush()

        result = await check_delegation(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="robin",
            resource="memory",
            action="write",
            scope="test",
        )
        assert result is None


class TestDelegationListing:
    """Tests for listing active delegations."""

    @pytest.mark.asyncio
    async def test_list_active(self, db_session, sample_tenant, sample_policy_cache):
        """List active delegations for a tenant."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="oracle",
            resource="memory",
            action="read",
            scope="*",
            ttl=600,
            reason="List test 1",
        )
        await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="oracle",
            resource="vault",
            action="read",
            scope="*",
            ttl=600,
            reason="List test 2",
        )
        await db_session.flush()

        delegations = await list_active_delegations(
            db_session, sample_tenant.id, persona_id="oracle"
        )
        assert len(delegations) >= 2


class TestDelegationCleanup:
    """Tests for expired delegation cleanup."""

    @pytest.mark.asyncio
    async def test_cleanup_expired(self, db_session, sample_tenant, sample_policy_cache):
        """Expired delegations are cleaned up."""
        _, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        delegation = await create_delegation(
            db_session,
            grantor_soulkey=soulkey,
            grantee_persona="robin",
            resource="memory",
            action="read",
            scope="*",
            ttl=1,  # 1 second
            reason="Will expire",
        )
        await db_session.flush()

        # Manually set to expired
        delegation.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.flush()

        count = await cleanup_expired_delegations(db_session)
        assert count >= 1
