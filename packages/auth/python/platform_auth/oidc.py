"""
OIDC adapter stub.

ADR-002 promises that `AUTH_MODE=oidc` is a future extension point. This
module is the minimum viable seam: it provides an `OidcAdapter` Protocol and
a default `NotConfiguredAdapter` that raises a clear error when called. Real
provider integrations live in `platform_auth.oidc_providers.*` modules.

The intent is that platform-api can do:

    from platform_auth.oidc import get_oidc_adapter
    adapter = get_oidc_adapter()      # picks env-driven provider or NotConfigured
    redirect_url = adapter.start_login(state)

without a hard import on any provider SDK. Provider modules are imported
lazily so that adding `oauthlib` / `authlib` does not become a runtime cost
for the local-auth default path.
"""

from __future__ import annotations

import os
from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class OidcAdapter(Protocol):
    """Provider-agnostic OIDC adapter interface."""

    name: str

    def start_login(self, state: str, redirect_uri: str) -> str:
        """Return the URL the BFF should redirect the user to."""

    def exchange_code(self, code: str, redirect_uri: str) -> dict:
        """Exchange an auth code for tokens; return id_token claims dict."""


class OidcNotConfiguredError(RuntimeError):
    """Raised when an OIDC operation is attempted but no adapter is configured."""


class NotConfiguredAdapter:
    """
    Default adapter used when AUTH_MODE=oidc but no provider is configured.
    Raises a clear error instead of silently failing or 500ing.
    """

    name = "not-configured"

    def start_login(self, state: str, redirect_uri: str) -> str:
        raise OidcNotConfiguredError(
            "OIDC adapter is not configured. "
            "Set OIDC_PROVIDER=<provider-name> and the provider-specific env vars."
        )

    def exchange_code(self, code: str, redirect_uri: str) -> dict:
        raise OidcNotConfiguredError(
            "OIDC adapter is not configured. "
            "Set OIDC_PROVIDER=<provider-name> and the provider-specific env vars."
        )


_REGISTRY: dict[str, type] = {
    "not-configured": NotConfiguredAdapter,
}


def register_adapter(name: str, cls: type) -> None:
    """Register a provider class under ``name`` (call from a provider module)."""
    _REGISTRY[name] = cls


def get_oidc_adapter(provider: Optional[str] = None) -> OidcAdapter:
    """
    Return an OIDC adapter instance. If ``provider`` is None we read the
    ``OIDC_PROVIDER`` env var. Unknown provider strings fall back to the
    NotConfigured adapter so callers always get a stable interface.
    """
    name = provider or os.environ.get("OIDC_PROVIDER") or "not-configured"
    cls = _REGISTRY.get(name, NotConfiguredAdapter)
    return cls()  # type: ignore[return-value]


def auth_mode() -> str:
    """Read the active AUTH_MODE env var; defaults to 'local'."""
    return (os.environ.get("AUTH_MODE") or "local").strip().lower()


def is_oidc_enabled() -> bool:
    return auth_mode() == "oidc"
