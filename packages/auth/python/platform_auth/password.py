"""Argon2id password hashing using argon2-cffi."""

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(plain: str) -> str:
    """Hash a plaintext password with Argon2id. Returns the encoded hash string."""
    return _ph.hash(plain)


def verify_password(hash: str, plain: str) -> bool:
    """
    Verify a plaintext password against an Argon2id hash.
    Returns False instead of raising on mismatch.
    """
    try:
        return _ph.verify(hash, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hash: str) -> bool:
    """Return True if the hash was created with outdated parameters."""
    return _ph.check_needs_rehash(hash)
