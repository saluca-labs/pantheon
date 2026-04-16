"""Unit tests for Phase C redaction middleware."""
from __future__ import annotations

import os

import pytest

from tiresias.proxy.redactor import LogRedactor


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for k in ("REDACT_IPV4_PRIVATE", "TIRESIAS_LOG_REDACT_ALLOWLIST"):
        monkeypatch.delenv(k, raising=False)


def test_email_redacted():
    r = LogRedactor()
    assert r.redact("contact: alice@example.com please") == "contact: [REDACTED:email] please"


def test_bearer_token_redacted():
    r = LogRedactor()
    out = r.redact("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc")
    assert "[REDACTED:bearer]" in out
    assert "eyJ" not in out


def test_stripe_key_redacted():
    r = LogRedactor()
    out = r.redact("key=sk_live_abc123DEF456ghi789JKL")
    assert "[REDACTED:stripe_key]" in out


def test_aws_key_redacted():
    r = LogRedactor()
    out = r.redact("aws=AKIAIOSFODNN7EXAMPLE")
    assert "[REDACTED:aws_key]" in out


def test_tiresias_key_redacted():
    r = LogRedactor()
    out = r.redact("header X-Tiresias-Api-Key: tir_acme_0123456789abcdef0123456789abcdef")
    assert "[REDACTED:tiresias_key]" in out


def test_ssn_redacted():
    r = LogRedactor()
    out = r.redact("ssn=123-45-6789")
    assert "[REDACTED:ssn]" in out


def test_credit_card_redacted_only_if_luhn_valid():
    r = LogRedactor()
    # 4532015112830366 is a valid Luhn test card
    valid = r.redact("cc=4532015112830366")
    assert "[REDACTED:credit_card]" in valid
    # 1234567890123456 is not Luhn-valid
    invalid = r.redact("cc=1234567890123456")
    assert "[REDACTED:credit_card]" not in invalid


def test_ipv4_private_opt_in_default_off():
    r = LogRedactor()
    assert r.redact("internal=10.0.0.5") == "internal=10.0.0.5"


def test_ipv4_private_opt_in_env(monkeypatch):
    monkeypatch.setenv("REDACT_IPV4_PRIVATE", "true")
    r = LogRedactor()
    assert "[REDACTED:ipv4_private]" in r.redact("internal=10.0.0.5")
    assert "[REDACTED:ipv4_private]" in r.redact("internal=172.16.1.2")
    assert "[REDACTED:ipv4_private]" in r.redact("internal=192.168.0.1")
    # Public IP should NOT match
    assert "[REDACTED:ipv4_private]" not in r.redact("public=8.8.8.8")


def test_record_redaction_leaves_identity_fields():
    r = LogRedactor()
    record = {
        "actor_id": "user-abc",
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "resource_id": "soulkey-123",
        "payload": {"user_email": "bob@example.com"},
    }
    out = r.redact_record(record)
    assert out["actor_id"] == "user-abc"
    assert out["tenant_id"] == "00000000-0000-0000-0000-000000000001"
    assert out["resource_id"] == "soulkey-123"
    assert out["payload"]["user_email"] == "[REDACTED:email]"


def test_allowlist_respected():
    r = LogRedactor(allowlist=["user_email"])
    out = r.redact_record({"user_email": "alice@example.com"})
    assert out["user_email"] == "alice@example.com"


def test_nested_list_redaction():
    r = LogRedactor()
    out = r.redact_record({"items": [{"email": "a@b.co"}, "sk_live_abcdefghij1234567890"]})
    assert out["items"][0]["email"] == "[REDACTED:email]"
    assert "[REDACTED:stripe_key]" in out["items"][1]


def test_non_string_passthrough():
    r = LogRedactor()
    assert r.redact(123) == 123  # type: ignore[arg-type]
    assert r.redact("") == ""


def test_allowlist_default_none():
    """Per C-CESO-1, default allowlist for production is none (only identity fields pass)."""
    r = LogRedactor()
    # A non-identity field containing an email must be redacted.
    out = r.redact_record({"free_text": "my email is bob@example.com"})
    assert "bob@example.com" not in out["free_text"]
    assert "[REDACTED:email]" in out["free_text"]
