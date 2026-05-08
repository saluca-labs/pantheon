"""Exceptions raised by the secrets facade."""

from __future__ import annotations


class SecretReferenceError(ValueError):
    """The reference string is malformed or uses an unknown backend."""


class SecretNotFoundError(LookupError):
    """The reference is well-formed but no value exists in the backend."""


class SecretBackendError(RuntimeError):
    """The backend itself failed (network error, auth error, missing SDK)."""
