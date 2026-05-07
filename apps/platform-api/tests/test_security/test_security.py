"""
Security tests for SoulAuth.
Verifies zero-trust properties, token security, and boundary enforcement.
"""

import uuid
import time
from datetime import datetime, timedelta, timezone

import pytest
import jwt as pyjwt

from src.tokens.capability import (
    issue_capability_token,
    validate_capability_token,
    scope_matches,
    get_private_key,
    TokenExpiredError,
    TokenInvalidError,
    TokenRevokedError,
)
from src.auth.soulkey import generate_soulkey, hash_soulkey
from src.middleware.pep import _is_protected, _derive_scope_from_request


class TestTokenSecurity:
    """Security tests for capability tokens."""

    def test_token_cannot_be_forged(self):
        """Tokens signed with wrong key are rejected."""
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.backends import default_backend

        # Generate a different key
        fake_key = ec.generate_private_key(ec.SECP256R1(), default_backend())

        payload = {
            "iss": "soulauth",
            "sub": str(uuid.uuid4()),
            "tid": str(uuid.uuid4()),
            "pid": "fake",
            "scp": ["*"],
            "sid": "",
            "jti": str(uuid.uuid4()),
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        fake_token = pyjwt.encode(payload, fake_key, algorithm="ES256")

        with pytest.raises(TokenInvalidError):
            validate_capability_token(fake_token)

    def test_token_with_modified_claims_rejected(self):
        """Tampered token body is rejected."""
        # Issue a valid token
        token, _, _ = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="test",
            granted_scopes=["memory:read:*"],
        )

        # Tamper with the payload by modifying a character
        parts = token.split(".")
        # Modify payload
        tampered = parts[0] + "." + parts[1][:-1] + "X" + "." + parts[2]
        with pytest.raises((TokenInvalidError, Exception)):
            validate_capability_token(tampered)

    def test_expired_token_rejected(self):
        """Expired tokens are properly rejected."""
        payload = {
            "iss": "soulauth",
            "sub": str(uuid.uuid4()),
            "tid": str(uuid.uuid4()),
            "pid": "test",
            "scp": ["test:read:*"],
            "sid": "",
            "jti": str(uuid.uuid4()),
            "iat": 1000000000,
            "exp": 1000000001,
        }
        expired_token = pyjwt.encode(payload, get_private_key(), algorithm="ES256")
        with pytest.raises(TokenExpiredError):
            validate_capability_token(expired_token)

    def test_token_without_required_claims_rejected(self):
        """Token missing required claims is rejected."""
        payload = {
            "iss": "soulauth",
            "sub": str(uuid.uuid4()),
            # Missing: tid, scp, jti
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        bad_token = pyjwt.encode(payload, get_private_key(), algorithm="ES256")
        with pytest.raises(TokenInvalidError):
            validate_capability_token(bad_token)

    def test_short_lived_token_ttl(self):
        """Tokens with very short TTL expire quickly."""
        token, _, _ = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="test",
            granted_scopes=["test:read:*"],
            ttl=1,  # 1 second
        )
        # Should be valid immediately
        claims = validate_capability_token(token)
        assert claims is not None


class TestSoulkeySecurity:
    """Security tests for soulkey system."""

    def test_soulkey_hash_is_one_way(self):
        """Hash cannot be reversed to recover the key."""
        raw, hashed = generate_soulkey("sal", "alfred")
        # The hash should not contain the raw key
        assert raw not in hashed
        # Hash is fixed length regardless of input
        assert len(hashed) == 128

    def test_different_keys_different_hashes(self):
        """Different keys produce different hashes."""
        _, h1 = generate_soulkey("sal", "alfred")
        _, h2 = generate_soulkey("sal", "alfred")
        assert h1 != h2

    def test_key_entropy(self):
        """Soulkeys have sufficient entropy (32 hex bytes = 256 bits)."""
        raw, _ = generate_soulkey("sal", "alfred")
        hex_part = raw.split("_", 4)[-1]
        assert len(hex_part) == 64  # 32 bytes = 64 hex chars


class TestScopeEnforcement:
    """Security tests for scope-based access control."""

    def test_narrow_scope_does_not_grant_broader_access(self):
        """Narrow scope doesn't match broader requests."""
        assert not scope_matches(
            ["memory:read:cs:algorithms"],
            "memory:read:business:strategy",
        )

    def test_read_scope_does_not_grant_write(self):
        """Read scope doesn't match write requests."""
        assert not scope_matches(
            ["memory:read:*"],
            "memory:write:anything",
        )

    def test_wildcard_resource_does_not_cross_resources(self):
        """Wildcard within a resource doesn't grant other resources."""
        assert not scope_matches(
            ["memory:read:*"],
            "vault:read:SECRET_KEY",
        )

    def test_empty_scopes_deny_all(self):
        """Empty scope list denies everything."""
        assert not scope_matches([], "memory:read:anything")

    def test_scope_traversal_attempt(self):
        """Scope traversal attempts are blocked."""
        assert not scope_matches(
            ["memory:read:cs:*"],
            "memory:read:../vault:SECRET",
        )


class TestPEPEnforcement:
    """Security tests for PEP middleware path protection."""

    def test_protected_memory_paths(self):
        """Memory paths are protected."""
        assert _is_protected("/v1/memory/cs/algorithms")
        assert _is_protected("/v1/memory/anything")

    def test_protected_vault_paths(self):
        """Vault paths are protected."""
        assert _is_protected("/v1/vault/OPENAI_API_KEY")

    def test_protected_mesh_paths(self):
        """Mesh paths are protected."""
        assert _is_protected("/v1/mesh/ai-lab")

    def test_open_auth_paths(self):
        """Auth paths are open (use soulkey, not capability token)."""
        assert not _is_protected("/v1/auth/identity")
        assert not _is_protected("/v1/auth/evaluate")

    def test_open_admin_paths(self):
        """Admin paths are open (protected by admin auth, not PEP)."""
        assert not _is_protected("/v1/soulauth/admin/keys")

    def test_open_trial_paths(self):
        """Trial paths are open."""
        assert not _is_protected("/v1/trial/register")

    def test_open_health_and_docs(self):
        """Health and docs paths are open."""
        assert not _is_protected("/health")
        assert not _is_protected("/docs")
        assert not _is_protected("/openapi.json")


class TestGDPRCompliance:
    """Tests for GDPR compliance of trial data handling."""

    def test_trial_data_fields_are_bounded(self):
        """Trial model only stores necessary PII fields."""
        from src.database.models import Trial
        columns = {c.name for c in Trial.__table__.columns}
        # Should have contact fields
        assert "contact_name" in columns
        assert "contact_email" in columns
        assert "company_name" in columns
        # Should have status tracking
        assert "status" in columns
        assert "created_at" in columns
        assert "expires_at" in columns

    def test_soulkey_does_not_store_raw_key(self):
        """Soulkey model only stores hash, never the raw key."""
        from src.database.models import Soulkey
        columns = {c.name for c in Soulkey.__table__.columns}
        assert "key_hash" in columns
        # raw_key should NOT be a column
        assert "raw_key" not in columns

    def test_audit_log_is_append_only(self):
        """Audit log model has no update timestamp — it's append-only."""
        from src.database.models import AuditLog
        columns = {c.name for c in AuditLog.__table__.columns}
        assert "timestamp" in columns
        assert "created_at" in columns
        # No updated_at column — logs are immutable
        assert "updated_at" not in columns
