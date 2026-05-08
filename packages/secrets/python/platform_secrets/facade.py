"""Unified facade that routes secret references to the right backend.

Reference syntax
----------------

A *secret reference* is a string with one of these shapes:

  - ``env://VAR_NAME`` — read from process environment
  - ``file:///path/to/secret`` — read full file contents (k8s/docker secrets)
  - ``vault://<mount>/data/<path>#<field>`` — HashiCorp Vault KV-v2
  - ``awssm://<arn-or-name>[#<json-field>]`` — AWS Secrets Manager
  - ``gcpsm://projects/<id>/secrets/<name>/versions/<v>`` — GCP Secret Manager

Anything that does not start with ``<scheme>://`` is treated as a literal
value (or, when ``resolve()`` is called with the legacy 1-arg form, an
env-var name for backward compatibility).
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional

from platform_secrets.backends import (
    AwsSecretsManagerBackend,
    EnvBackend,
    FileBackend,
    GcpSecretManagerBackend,
    VaultBackend,
)
from platform_secrets.errors import SecretNotFoundError, SecretReferenceError
from platform_secrets.protocol import SecretsBackend

logger = logging.getLogger(__name__)


_REFERENCE_SEP = "://"


def is_secret_reference(value: str) -> bool:
    """Return ``True`` iff ``value`` looks like ``<scheme>://...``."""
    if not isinstance(value, str):
        return False
    idx = value.find(_REFERENCE_SEP)
    if idx <= 0:
        return False
    scheme = value[:idx]
    return scheme.isalnum() and scheme.islower()


def _split_reference(value: str) -> tuple[str, str]:
    idx = value.find(_REFERENCE_SEP)
    if idx <= 0:
        raise SecretReferenceError(f"Not a valid secret reference: {value!r}")
    return value[:idx], value[idx + len(_REFERENCE_SEP) :]


# ── Facade ──────────────────────────────────────────────────────────────────


@dataclass
class SecretsFacade:
    """Stateful resolver — caches one backend instance per scheme."""

    backends: Dict[str, SecretsBackend] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def register(self, backend: SecretsBackend) -> None:
        """Register (or replace) the backend for ``backend.scheme``."""
        with self._lock:
            self.backends[backend.scheme] = backend

    def _resolve_backend(self, scheme: str) -> SecretsBackend:
        backend = self.backends.get(scheme)
        if backend is None:
            # Lazy-instantiate the canonical backend for this scheme.
            factory = _DEFAULT_FACTORIES.get(scheme)
            if factory is None:
                raise SecretReferenceError(
                    f"No backend registered for scheme {scheme!r}."
                )
            backend = factory()
            self.register(backend)
        return backend

    def resolve(
        self,
        value: str,
        *,
        default: Optional[str] = None,
        no_cache: bool = False,
    ) -> Optional[str]:
        """Resolve a secret reference, or return ``value`` if it isn't one.

        Behaviour for plain (non-reference) inputs:

        * If a same-named environment variable exists, return it (this
          preserves the legacy ``resolve("DATABASE_URL")`` shape used by the
          config loader).
        * Otherwise return ``value`` unchanged (literals pass through).

        For references, the matching backend is consulted. Missing values
        fall through to ``default`` rather than raising — this lets callers
        distinguish ``optional`` from ``required`` at the call site.
        """
        if not isinstance(value, str):
            return value

        if not is_secret_reference(value):
            # Legacy compat: treat bare names as env-var lookups.
            return os.environ.get(value, value if default is None else default)

        scheme, path = _split_reference(value)
        # Custom-registered backends take precedence over default factories,
        # so apps can plug in their own scheme (e.g. ``stub://`` in tests,
        # or a corp-specific provider).
        if scheme not in self.backends and scheme not in _DEFAULT_FACTORIES:
            known = sorted(set(self.backends) | set(_DEFAULT_FACTORIES))
            raise SecretReferenceError(
                f"Unknown secret backend scheme: {scheme!r}. Known: {known}"
            )
        backend = self._resolve_backend(scheme)
        result = backend.get(path, no_cache=no_cache)
        if result is None:
            if default is not None:
                return default
            return None
        return result

    def resolve_required(self, value: str, *, no_cache: bool = False) -> str:
        """Like ``resolve`` but raises if the secret is missing."""
        result = self.resolve(value, no_cache=no_cache)
        if result is None:
            raise SecretNotFoundError(f"Secret not found: {value!r}")
        return result

    def resolve_mapping(
        self, mapping: Mapping[str, str], *, no_cache: bool = False
    ) -> Dict[str, Optional[str]]:
        """Resolve every value in a mapping, returning a fresh dict."""
        return {k: self.resolve(v, no_cache=no_cache) for k, v in mapping.items()}


# ── Module-level singleton ──────────────────────────────────────────────────

_DEFAULT_FACTORIES: Dict[str, "type[SecretsBackend] | callable"] = {
    "env": EnvBackend,
    "file": FileBackend,
    "vault": VaultBackend,
    "awssm": AwsSecretsManagerBackend,
    "gcpsm": GcpSecretManagerBackend,
}


_singleton_lock = threading.Lock()
_singleton: Optional[SecretsFacade] = None


def get_facade() -> SecretsFacade:
    """Return the process-wide singleton facade (creates on first call)."""
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = SecretsFacade()
    return _singleton


def configure(*backends: SecretsBackend) -> SecretsFacade:
    """Register one or more backends on the singleton, returning it.

    Use this at process start when you need to inject a pre-authenticated
    Vault client or a credentialed boto3 session — the default lazy
    factories build clients from environment variables, which is fine for
    most deployments but not all.
    """
    facade = get_facade()
    for backend in backends:
        facade.register(backend)
    return facade


def resolve(value: str, *, default: Optional[str] = None, no_cache: bool = False) -> Optional[str]:
    """Module-level shortcut for ``get_facade().resolve(...)``."""
    return get_facade().resolve(value, default=default, no_cache=no_cache)


def resolve_mapping(
    mapping: Mapping[str, str], *, no_cache: bool = False
) -> Dict[str, Optional[str]]:
    """Module-level shortcut for ``get_facade().resolve_mapping(...)``."""
    return get_facade().resolve_mapping(mapping, no_cache=no_cache)
