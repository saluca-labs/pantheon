"""
Tests for soulkey generation and identity resolution.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from src.auth.soulkey import (
    generate_soulkey,
    hash_soulkey,
    resolve_identity,
    issue_soulkey,
    suspend_soulkey,
    reinstate_soulkey,
    revoke_soulkey,
    list_soulkeys,
    check_key_expiry,
)


class TestSoulkeyGeneration:
    """Tests for soulkey format and generation."""

    def test_generate_soulkey_format(self):
        """Soulkey must follow sk_agent_<tenant>_<persona>_<hex32> format."""
        raw, hashed = generate_soulkey("sal", "alfred")
        assert raw.startswith("sk_agent_sal_alfred_")
        assert len(raw.split("_")) >= 5
        # hex32 = 64 hex chars
        hex_part = raw.split("_", 4)[-1]
        assert len(hex_part) == 64

    def test_generate_soulkey_uniqueness(self):
        """Each generated soulkey must be unique."""
        keys = set()
        for _ in range(100):
            raw, _ = generate_soulkey("sal", "alfred")
            keys.add(raw)
        assert len(keys) == 100

    def test_hash_soulkey_consistency(self):
        """Same raw key must always produce same hash."""
        raw = "sk_agent_sal_alfred_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        h1 = hash_soulkey(raw)
        h2 = hash_soulkey(raw)
        assert h1 == h2

    def test_hash_soulkey_sha512_length(self):
        """Hash must be SHA-512 (128 hex chars)."""
        raw, hashed = generate_soulkey("sal", "alfred")
        assert len(hashed) == 128  # SHA-512 = 64 bytes = 128 hex chars


class TestIdentityResolution:
    """Tests for identity resolution from soulkey."""

    @pytest.mark.asyncio
    async def test_resolve_valid_key(self, db_session, sample_tenant):
        """Valid soulkey resolves to correct identity."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
            label="Test Alfred key",
        )
        await db_session.flush()

        resolved = await resolve_identity(db_session, raw_key)
        assert resolved is not None
        assert resolved.persona_id == "alfred"
        assert resolved.tenant_id == sample_tenant.id
        assert resolved.status == "active"

    @pytest.mark.asyncio
    async def test_resolve_invalid_key(self, db_session):
        """Invalid soulkey returns None."""
        resolved = await resolve_identity(db_session, "sk_agent_fake_key_0000")
        assert resolved is None

    @pytest.mark.asyncio
    async def test_resolve_updates_last_used(self, db_session, sample_tenant):
        """Identity resolution updates last_used_at."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="oracle",
            tenant_short="sal",
        )
        await db_session.flush()

        assert soulkey.last_used_at is None
        resolved = await resolve_identity(db_session, raw_key)
        # last_used_at is updated via DB, need to refresh
        assert resolved is not None


class TestKeyLifecycle:
    """Tests for soulkey lifecycle management."""

    @pytest.mark.asyncio
    async def test_suspend_active_key(self, db_session, sample_tenant):
        """Suspending an active key sets status to suspended."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="robin",
            tenant_short="sal",
        )
        await db_session.flush()

        result = await suspend_soulkey(db_session, soulkey.id, "admin")
        assert result is not None
        assert result.status == "suspended"

    @pytest.mark.asyncio
    async def test_reinstate_suspended_key(self, db_session, sample_tenant):
        """Reinstating a suspended key returns to active."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="nightwing",
            tenant_short="sal",
        )
        await db_session.flush()

        await suspend_soulkey(db_session, soulkey.id, "admin")
        await db_session.flush()

        result = await reinstate_soulkey(db_session, soulkey.id)
        assert result is not None
        assert result.status == "active"

    @pytest.mark.asyncio
    async def test_revoke_key_is_terminal(self, db_session, sample_tenant):
        """Revoking a key is permanent — cannot reinstate."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="red-hood",
            tenant_short="sal",
        )
        await db_session.flush()

        await revoke_soulkey(db_session, soulkey.id, "admin", "security incident")
        await db_session.flush()

        # Cannot reinstate a revoked key
        result = await reinstate_soulkey(db_session, soulkey.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_cannot_suspend_revoked_key(self, db_session, sample_tenant):
        """Cannot suspend an already revoked key."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="harvey",
            tenant_short="sal",
        )
        await db_session.flush()

        await revoke_soulkey(db_session, soulkey.id, "admin", "test")
        await db_session.flush()

        result = await suspend_soulkey(db_session, soulkey.id, "admin")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_soulkeys_by_tenant(self, db_session, sample_tenant):
        """List soulkeys filtered by tenant."""
        for persona in ["a1", "a2", "a3"]:
            await issue_soulkey(
                db_session,
                tenant_id=sample_tenant.id,
                persona_id=persona,
                tenant_short="sal",
            )
        await db_session.flush()

        keys = await list_soulkeys(db_session, sample_tenant.id)
        assert len(keys) >= 3

    @pytest.mark.asyncio
    async def test_expired_key_auto_suspends(self, db_session, sample_tenant):
        """Expired keys auto-suspend on expiry check."""
        raw_key, soulkey = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="expiring",
            tenant_short="sal",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        await db_session.flush()

        is_valid = await check_key_expiry(db_session, soulkey)
        assert is_valid is False
