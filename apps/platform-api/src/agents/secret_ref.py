"""Minimal secret-URI resolver (W-H.2.b).

The canonical `platform_secrets` URI resolver (mentioned in the HANDOFF
and locked decision #5) does not yet exist in this repo. To unblock the
Supabase store this ship, we implement the narrowest possible resolver:
``env://VAR_NAME`` reads from process env.

Other schemes (``vault://``, ``gcpsm://``, ``enc://``) raise NotImplementedError
so callers fail loudly rather than silently storing plaintext. When the
canonical resolver lands later, this module should delegate to it.

Wire format:
    env://ANTHROPIC_API_KEY
    env://SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import os
from typing import Optional


class SecretRefError(ValueError):
    """Raised when a secret URI is malformed or unresolvable."""


def resolve_secret_ref(ref: str) -> str:
    """Resolve a secret URI reference to its plaintext value.

    Raises
    ------
    SecretRefError
        If the URI scheme is unknown, malformed, or the underlying value
        cannot be found.
    NotImplementedError
        If the URI uses a scheme that's reserved but not yet implemented.
    """
    if not ref or not isinstance(ref, str):
        raise SecretRefError("secret ref must be a non-empty string")

    if "://" not in ref:
        raise SecretRefError(
            f"secret ref missing scheme (expected e.g. 'env://VAR_NAME'): {ref!r}"
        )

    scheme, _, target = ref.partition("://")
    scheme = scheme.lower()

    if scheme == "env":
        if not target:
            raise SecretRefError("env:// missing variable name")
        val = os.environ.get(target)
        if val is None or val == "":
            raise SecretRefError(f"env var {target!r} is not set")
        return val

    if scheme in {"vault", "gcpsm", "awssm", "enc"}:
        # Reserved schemes the future platform_secrets resolver will own.
        raise NotImplementedError(
            f"secret-ref scheme {scheme!r} is reserved but not yet implemented; "
            "use env:// for now or wait for the platform_secrets module"
        )

    raise SecretRefError(f"unknown secret-ref scheme: {scheme!r}")


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
