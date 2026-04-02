"""
AES-256-GCM encryption for Aletheia CoT content storage.
Per-tenant Data Encryption Keys (DEKs) derived via HKDF-SHA256 from a master key.
Master key loaded from ALETHEIA_MASTER_KEY env var (base64-encoded 32 bytes).
"""

# DEPRECATED: This module is retained for backward compatibility with data encrypted
# before the envelope encryption migration. New code should use
# src.tiresias.encryption.envelope.EnvelopeEncryption instead.

import os
import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes


def get_master_key() -> bytes:
    """Load master key from ALETHEIA_MASTER_KEY env var (base64-encoded 32 bytes)."""
    key_b64 = os.environ.get("ALETHEIA_MASTER_KEY")
    if not key_b64:
        raise RuntimeError("ALETHEIA_MASTER_KEY environment variable not set")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise RuntimeError(
            f"ALETHEIA_MASTER_KEY must decode to exactly 32 bytes, got {len(key)}"
        )
    return key


def derive_tenant_dek(master_key: bytes, tenant_id: str) -> bytes:
    """Derive a per-tenant DEK using HKDF-SHA256.

    Args:
        master_key: 32-byte master secret.
        tenant_id: UUID string used as HKDF salt.

    Returns:
        32-byte AES-256 key unique to this tenant.
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=tenant_id.encode("utf-8"),
        info=b"aletheia-cot-dek",
    )
    return hkdf.derive(master_key)


def encrypt_content(dek: bytes, plaintext: bytes) -> tuple[bytes, bytes, bytes]:
    """AES-256-GCM encrypt plaintext.

    Args:
        dek: 32-byte Data Encryption Key.
        plaintext: Raw bytes to encrypt.

    Returns:
        Tuple of (ciphertext, nonce, tag).
        nonce is 12 bytes, tag is 16 bytes.
    """
    nonce = os.urandom(12)
    aesgcm = AESGCM(dek)
    # AESGCM.encrypt returns ciphertext || tag (tag is last 16 bytes)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    ciphertext = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return ciphertext, nonce, tag


def decrypt_content(dek: bytes, ciphertext: bytes, nonce: bytes, tag: bytes) -> bytes:
    """AES-256-GCM decrypt ciphertext.

    Args:
        dek: 32-byte Data Encryption Key (same as used for encryption).
        ciphertext: Encrypted bytes (without tag).
        nonce: 12-byte nonce from encryption.
        tag: 16-byte authentication tag from encryption.

    Returns:
        Decrypted plaintext bytes.

    Raises:
        cryptography.exceptions.InvalidTag: If ciphertext or tag is tampered.
    """
    aesgcm = AESGCM(dek)
    ct_with_tag = ciphertext + tag
    return aesgcm.decrypt(nonce, ct_with_tag, None)
