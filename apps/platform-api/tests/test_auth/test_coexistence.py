"""
Tests for legacy key coexistence layer.
"""

import uuid

import pytest
import pytest_asyncio

from src.auth.coexistence import (
    detect_key_type,
    extract_tenant_from_legacy_key,
    resolve_legacy_key,
    resolve_any_key,
)
from src.auth.soulkey import issue_soulkey


class TestKeyTypeDetection:
    """Tests for key format detection."""

    def test_detect_soulauth_key(self):
        """sk_agent_* keys detected as soulauth."""
        key = "sk_agent_sal_alfred_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        assert detect_key_type(key) == "soulauth"

    def test_detect_legacy_key(self):
        """sk_soul_* keys detected as legacy."""
        key = "sk_soul_saluca_abcdef1234567890"
        assert detect_key_type(key) == "legacy"

    def test_detect_unknown_key(self):
        """Unrecognized format returns unknown."""
        assert detect_key_type("random-string") == "unknown"
        assert detect_key_type("api_key_12345") == "unknown"

    def test_extract_tenant_from_legacy(self):
        """Extract tenant slug from legacy key."""
        key = "sk_soul_saluca_abcdef1234567890"
        assert extract_tenant_from_legacy_key(key) == "saluca"

    def test_extract_tenant_invalid(self):
        """Non-legacy key returns None."""
        assert extract_tenant_from_legacy_key("not-a-legacy-key") is None


class TestLegacyKeyResolution:
    """Tests for legacy key resolution."""

    @pytest.mark.asyncio
    async def test_resolve_legacy_key_valid_tenant(self, db_session, sample_tenant):
        """Legacy key resolves to service-account identity if tenant exists."""
        key = "sk_soul_saluca_abcdef1234567890"
        result = await resolve_legacy_key(db_session, key)
        assert result is not None
        assert result["type"] == "legacy"
        assert result["tenant_id"] == sample_tenant.id
        assert result["persona_id"] == "service-account"

    @pytest.mark.asyncio
    async def test_resolve_legacy_key_unknown_tenant(self, db_session):
        """Legacy key for non-existent tenant returns None."""
        key = "sk_soul_unknown_abcdef1234567890"
        result = await resolve_legacy_key(db_session, key)
        assert result is None


class TestAnyKeyResolution:
    """Tests for unified key resolution."""

    @pytest.mark.asyncio
    async def test_resolve_soulauth_key(self, db_session, sample_tenant):
        """Resolve a soulauth key via unified resolver."""
        raw_key, _ = await issue_soulkey(
            db_session,
            tenant_id=sample_tenant.id,
            persona_id="alfred",
            tenant_short="sal",
        )
        await db_session.flush()

        key_type, identity = await resolve_any_key(db_session, raw_key)
        assert key_type == "soulauth"
        assert identity is not None
        assert identity["type"] == "soulauth"
        assert identity["persona_id"] == "alfred"

    @pytest.mark.asyncio
    async def test_resolve_legacy_key_via_any(self, db_session, sample_tenant):
        """Resolve a legacy key via unified resolver."""
        key = "sk_soul_saluca_abcdef1234567890"
        key_type, identity = await resolve_any_key(db_session, key)
        assert key_type == "legacy"
        assert identity is not None
        assert identity["persona_id"] == "service-account"

    @pytest.mark.asyncio
    async def test_resolve_unknown_key(self, db_session):
        """Unknown key format returns unknown."""
        key_type, identity = await resolve_any_key(db_session, "not-a-key")
        assert key_type == "unknown"
        assert identity is None
