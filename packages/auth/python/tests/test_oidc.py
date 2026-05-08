"""Tests for the OIDC adapter stub."""

from __future__ import annotations

import pytest

from platform_auth.oidc import (
    NotConfiguredAdapter,
    OidcAdapter,
    OidcNotConfiguredError,
    auth_mode,
    get_oidc_adapter,
    is_oidc_enabled,
    register_adapter,
)


def test_default_adapter_is_not_configured(monkeypatch):
    monkeypatch.delenv("OIDC_PROVIDER", raising=False)
    a = get_oidc_adapter()
    assert isinstance(a, NotConfiguredAdapter)
    assert a.name == "not-configured"


def test_unknown_provider_falls_back_to_not_configured(monkeypatch):
    monkeypatch.setenv("OIDC_PROVIDER", "definitely-not-real")
    a = get_oidc_adapter()
    assert isinstance(a, NotConfiguredAdapter)


def test_explicit_provider_argument_overrides_env(monkeypatch):
    monkeypatch.setenv("OIDC_PROVIDER", "ignored")
    a = get_oidc_adapter(provider="not-configured")
    assert isinstance(a, NotConfiguredAdapter)


def test_not_configured_adapter_raises_clearly():
    a = NotConfiguredAdapter()
    with pytest.raises(OidcNotConfiguredError, match="not configured"):
        a.start_login("state-1", "https://example/cb")
    with pytest.raises(OidcNotConfiguredError):
        a.exchange_code("code-1", "https://example/cb")


def test_auth_mode_default():
    import os
    # save & restore
    saved = os.environ.pop("AUTH_MODE", None)
    try:
        assert auth_mode() == "local"
        assert is_oidc_enabled() is False
    finally:
        if saved is not None:
            os.environ["AUTH_MODE"] = saved


def test_auth_mode_oidc(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oidc")
    assert auth_mode() == "oidc"
    assert is_oidc_enabled() is True


def test_auth_mode_case_insensitive(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "OIDC")
    assert auth_mode() == "oidc"
    assert is_oidc_enabled() is True


def test_register_custom_adapter(monkeypatch):
    class _Stub:
        name = "stub"

        def start_login(self, state, redirect_uri):
            return f"https://stub/?state={state}"

        def exchange_code(self, code, redirect_uri):
            return {"sub": "stub-user", "email": "stub@example.com"}

    register_adapter("stub", _Stub)
    monkeypatch.setenv("OIDC_PROVIDER", "stub")
    a = get_oidc_adapter()
    assert a.name == "stub"
    assert isinstance(a, OidcAdapter)
    url = a.start_login("xyz", "https://app/cb")
    assert "state=xyz" in url
    claims = a.exchange_code("auth-code", "https://app/cb")
    assert claims["sub"] == "stub-user"
