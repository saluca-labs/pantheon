"""Secret-URI resolver for the agent BYOK code path.

Thin adapter over ``platform_secrets`` so callers can keep using the
``SecretRefError`` exception type and the ``describe_secret_ref`` wire-safe
summary helper without depending on the facade's exception hierarchy.

Originally this module was a minimal env-only stub written before the
canonical resolver existed (see W-H.2.b history). The facade now ships
in ``packages/secrets/python`` and supports ``env://``, ``file://``,
``vault://``, ``gcpsm://``, and ``awssm://``. This module delegates to it.

Wire format examples:
    env://ANTHROPIC_API_KEY
    vault://kv/data/anthropic#api_key
    gcpsm://projects/saluca-prod/secrets/anthropic-key/versions/latest
    awssm://arn:aws:secretsmanager:us-east-1:1234:secret:anthropic#api_key
"""

from __future__ import annotations

from typing import Optional

from platform_secrets import (
    SecretBackendError,
    SecretNotFoundError,
    SecretReferenceError,
    get_facade,
)


class SecretRefError(ValueError):
    """Raised when a secret URI is malformed or unresolvable."""


def resolve_secret_ref(ref: str) -> str:
    """Resolve a secret URI reference to its plaintext value.

    Raises
    ------
    SecretRefError
        If the URI scheme is unknown, malformed, the underlying value
        cannot be found, or the backend itself fails (missing SDK,
        unreachable, auth rejected).
    """
    if not ref or not isinstance(ref, str):
        raise SecretRefError("secret ref must be a non-empty string")

    if "://" not in ref:
        raise SecretRefError(
            f"secret ref missing scheme (expected e.g. 'env://VAR_NAME'): {ref!r}"
        )

    try:
        return get_facade().resolve_required(ref)
    except (SecretNotFoundError, SecretReferenceError, SecretBackendError) as exc:
        raise SecretRefError(str(exc)) from exc


def describe_secret_ref(ref: Optional[str]) -> dict:
    """Public-safe summary of a secret URI for UI/API responses.

    Never returns the resolved value. Returns the scheme and target only,
    so the user sees ``env://SUPABASE_SERVICE_ROLE_KEY`` and confirms which
    env var the pod will read — but the actual key is never echoed back.
    """
    if not ref or not isinstance(ref, str) or "://" not in ref:
        return {"scheme": None, "target": None, "valid": False}
    scheme, _, target = ref.partition("://")
    return {
        "scheme": scheme.lower(),
        "target": target,
        "valid": bool(target),
    }
