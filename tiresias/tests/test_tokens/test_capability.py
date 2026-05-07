"""
Tests for JWT capability token issuance and validation.
"""

import uuid
import time
from unittest.mock import patch

import pytest

from src.tokens.capability import (
    issue_capability_token,
    validate_capability_token,
    scope_matches,
    revoke_token,
    is_token_revoked,
    TokenExpiredError,
    TokenRevokedError,
)


class TestTokenIssuance:
    """Tests for capability token issuance."""

    def test_issue_token_returns_jwt(self):
        """Issued token is a valid JWT string."""
        token, jti, exp = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="alfred",
            granted_scopes=["memory:read:*"],
            ttl=300,
        )
        assert isinstance(token, str)
        assert len(token) > 0
        assert "." in token  # JWT has header.payload.signature

    def test_issue_token_unique_jti(self):
        """Each token has a unique JTI."""
        jtis = set()
        for _ in range(50):
            _, jti, _ = issue_capability_token(
                soulkey_id=uuid.uuid4(),
                tenant_id=uuid.uuid4(),
                persona_id="alfred",
                granted_scopes=["memory:read:*"],
            )
            jtis.add(jti)
        assert len(jtis) == 50

    def test_issue_token_with_session_binding(self):
        """Token includes session binding when provided."""
        token, _, _ = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="oracle",
            granted_scopes=["memory:read:cs:*"],
            session_binding="oracle-main",
        )
        claims = validate_capability_token(token)
        assert claims["sid"] == "oracle-main"


class TestTokenValidation:
    """Tests for capability token validation."""

    def test_validate_valid_token(self):
        """Valid token decodes successfully."""
        sk_id = uuid.uuid4()
        t_id = uuid.uuid4()
        token, jti, _ = issue_capability_token(
            soulkey_id=sk_id,
            tenant_id=t_id,
            persona_id="alfred",
            granted_scopes=["memory:write:cs:algorithms"],
            ttl=300,
        )
        claims = validate_capability_token(token)
        assert claims["sub"] == str(sk_id)
        assert claims["tid"] == str(t_id)
        assert claims["pid"] == "alfred"
        assert claims["scp"] == ["memory:write:cs:algorithms"]
        assert claims["iss"] == "soulauth"

    def test_validate_expired_token(self):
        """Expired token raises TokenExpiredError."""
        token, _, _ = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="alfred",
            granted_scopes=["memory:read:*"],
            ttl=0,  # Expires immediately
        )
        # Token with 0 TTL may or may not be expired depending on timing
        # Use a negative approach instead
        import jwt as pyjwt
        from src.tokens.capability import get_private_key
        expired_payload = {
            "iss": "soulauth",
            "sub": str(uuid.uuid4()),
            "tid": str(uuid.uuid4()),
            "pid": "test",
            "scp": ["test:read:*"],
            "sid": "",
            "jti": str(uuid.uuid4()),
            "iat": 1000000000,
            "exp": 1000000001,  # Long expired
        }
        expired_token = pyjwt.encode(expired_payload, get_private_key(), algorithm="ES256")
        with pytest.raises(TokenExpiredError):
            validate_capability_token(expired_token)

    @pytest.mark.asyncio
    async def test_validate_revoked_token(self, db_session):
        """Revoked token raises TokenRevokedError."""
        token, jti, _ = issue_capability_token(
            soulkey_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            persona_id="alfred",
            granted_scopes=["memory:read:*"],
            ttl=300,
        )
        await revoke_token(jti, db_session)
        assert is_token_revoked(jti)
        with pytest.raises(TokenRevokedError):
            validate_capability_token(token)


class TestScopeMatching:
    """Tests for scope matching logic."""

    def test_exact_scope_match(self):
        assert scope_matches(["memory:write:cs:algorithms"], "memory:write:cs:algorithms")

    def test_wildcard_all(self):
        assert scope_matches(["*"], "memory:write:cs:algorithms")

    def test_wildcard_scope_suffix(self):
        assert scope_matches(["memory:write:*"], "memory:write:cs:algorithms")

    def test_no_match(self):
        assert not scope_matches(["memory:read:cs:algorithms"], "vault:read:OPENAI_API_KEY")

    def test_action_mismatch(self):
        assert not scope_matches(["memory:read:cs:algorithms"], "memory:write:cs:algorithms")

    def test_multiple_scopes(self):
        granted = ["memory:read:cs:*", "vault:read:OPENAI_API_KEY"]
        assert scope_matches(granted, "memory:read:cs:algorithms")
        assert scope_matches(granted, "vault:read:OPENAI_API_KEY")
        assert not scope_matches(granted, "mesh:ssh:ai-lab")

    def test_partial_wildcard(self):
        assert scope_matches(["memory:*"], "memory:write:cs:algorithms")
