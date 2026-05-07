"""First-boot helpers — API key generation, hashing, and verification."""

from __future__ import annotations

import hashlib
import hmac
import secrets


def generate_api_key(length: int = 43) -> str:
    """Return a cryptographically random URL-safe API key.

    Default length of 43 characters yields ~256 bits of entropy
    (``secrets.token_urlsafe`` produces ceil(nbytes * 4/3) characters).
    """
    # token_urlsafe(32) -> 43 chars
    return secrets.token_urlsafe(32)[:length]


def hash_api_key(api_key: str) -> str:
    """Return the hex-encoded SHA-256 digest of *api_key*."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def verify_api_key(api_key: str, expected_hash: str) -> bool:
    """Constant-time comparison of an API key against its stored hash.

    Uses ``hmac.compare_digest`` to avoid timing side-channels.
    """
    candidate = hash_api_key(api_key)
    return hmac.compare_digest(candidate, expected_hash)
