"""
Tests for OIDC token exchange and validation logic.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

from src.auth.oidc_exchange import extract_user_claims, OIDCValidationError


class TestExtractUserClaims:
    def test_default_mapping(self):
        claims = {"sub": "abc123", "email": "user@example.com", "name": "Alice"}
        result = extract_user_claims(claims, {"email": "email", "name": "name"})
        assert result["email"] == "user@example.com"
        assert result["name"] == "Alice"
        assert result["sub"] == "abc123"

    def test_custom_mapping(self):
        claims = {"sub": "abc123", "upn": "user@corp.com", "displayName": "Bob"}
        result = extract_user_claims(claims, {"email": "upn", "name": "displayName"})
        assert result["email"] == "user@corp.com"
        assert result["name"] == "Bob"

    def test_missing_claim_returns_empty(self):
        claims = {"sub": "abc123"}
        result = extract_user_claims(claims, {"email": "email", "name": "name"})
        assert result["email"] == ""
        assert result["name"] == ""

    def test_raw_claims_preserved(self):
        claims = {"sub": "x", "email": "x@y.com", "extra": "data"}
        result = extract_user_claims(claims, {})
        assert result["raw"]["extra"] == "data"

    def test_none_mapping_uses_defaults(self):
        claims = {"sub": "abc", "email": "a@b.com", "name": "Test"}
        result = extract_user_claims(claims, None)
        assert result["email"] == "a@b.com"
