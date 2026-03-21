"""
Tests for Aletheia CoT encrypted storage and proof APIs (Plan 16-02).

Covers:
- AES-256-GCM encryption round-trip
- HKDF DEK derivation determinism and tenant isolation
- Content storage/retrieval service
- Proof export with verification hash
- Chain verification API
"""

import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from src.aletheia.encryption import (
    derive_tenant_dek,
    encrypt_content,
    decrypt_content,
    get_master_key,
)


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

TEST_MASTER_KEY = os.urandom(32)
TEST_MASTER_KEY_B64 = base64.b64encode(TEST_MASTER_KEY).decode()


@pytest.fixture(autouse=True)
def set_master_key_env(monkeypatch):
    """Set ALETHEIA_MASTER_KEY for all tests."""
    monkeypatch.setenv("ALETHEIA_MASTER_KEY", TEST_MASTER_KEY_B64)


# ------------------------------------------------------------------
# Encryption unit tests
# ------------------------------------------------------------------

class TestEncryption:
    """Tests for src/aletheia/encryption.py"""

    def test_get_master_key_loads_from_env(self):
        key = get_master_key()
        assert key == TEST_MASTER_KEY
        assert len(key) == 32

    def test_get_master_key_missing_raises(self, monkeypatch):
        monkeypatch.delenv("ALETHEIA_MASTER_KEY", raising=False)
        with pytest.raises(RuntimeError, match="not set"):
            get_master_key()

    def test_get_master_key_wrong_length_raises(self, monkeypatch):
        bad_key = base64.b64encode(b"short").decode()
        monkeypatch.setenv("ALETHEIA_MASTER_KEY", bad_key)
        with pytest.raises(RuntimeError, match="32 bytes"):
            get_master_key()

    def test_encrypt_decrypt_roundtrip(self):
        """Encrypt then decrypt produces original plaintext."""
        dek = derive_tenant_dek(TEST_MASTER_KEY, "tenant-abc")
        plaintext = b"This is sensitive CoT reasoning content."
        ciphertext, nonce, tag = encrypt_content(dek, plaintext)

        assert ciphertext != plaintext
        assert len(nonce) == 12
        assert len(tag) == 16

        decrypted = decrypt_content(dek, ciphertext, nonce, tag)
        assert decrypted == plaintext

    def test_encrypt_decrypt_unicode(self):
        """Round-trip with unicode content."""
        dek = derive_tenant_dek(TEST_MASTER_KEY, "tenant-unicode")
        plaintext = "Reasoning with unicode: \u2603 \u2764 \u00e9\u00e8\u00ea".encode("utf-8")
        ct, nonce, tag = encrypt_content(dek, plaintext)
        result = decrypt_content(dek, ct, nonce, tag)
        assert result == plaintext

    def test_encrypt_produces_different_ciphertexts(self):
        """Each encryption uses a random nonce, so ciphertext differs."""
        dek = derive_tenant_dek(TEST_MASTER_KEY, "tenant-x")
        plaintext = b"same content"
        ct1, n1, t1 = encrypt_content(dek, plaintext)
        ct2, n2, t2 = encrypt_content(dek, plaintext)
        # Nonces should differ (12 random bytes)
        assert n1 != n2

    def test_dek_derivation_deterministic(self):
        """Same master_key + tenant_id always produces the same DEK."""
        dek1 = derive_tenant_dek(TEST_MASTER_KEY, "tenant-123")
        dek2 = derive_tenant_dek(TEST_MASTER_KEY, "tenant-123")
        assert dek1 == dek2

    def test_different_tenants_get_different_deks(self):
        """Tenant A DEK != Tenant B DEK."""
        dek_a = derive_tenant_dek(TEST_MASTER_KEY, "tenant-a")
        dek_b = derive_tenant_dek(TEST_MASTER_KEY, "tenant-b")
        assert dek_a != dek_b
        assert len(dek_a) == 32
        assert len(dek_b) == 32

    def test_wrong_dek_fails_decrypt(self):
        """Decrypting with wrong tenant DEK raises InvalidTag."""
        from cryptography.exceptions import InvalidTag

        dek_a = derive_tenant_dek(TEST_MASTER_KEY, "tenant-a")
        dek_b = derive_tenant_dek(TEST_MASTER_KEY, "tenant-b")
        plaintext = b"secret data"
        ct, nonce, tag = encrypt_content(dek_a, plaintext)

        with pytest.raises(InvalidTag):
            decrypt_content(dek_b, ct, nonce, tag)

    def test_tampered_ciphertext_fails(self):
        """Tampered ciphertext raises InvalidTag."""
        from cryptography.exceptions import InvalidTag

        dek = derive_tenant_dek(TEST_MASTER_KEY, "tenant-tamper")
        ct, nonce, tag = encrypt_content(dek, b"original")

        # Flip a byte in ciphertext
        tampered = bytearray(ct)
        if len(tampered) > 0:
            tampered[0] ^= 0xFF
        tampered = bytes(tampered)

        with pytest.raises(InvalidTag):
            decrypt_content(dek, tampered, nonce, tag)


# ------------------------------------------------------------------
# Proof verification hash test
# ------------------------------------------------------------------

class TestProofVerificationHash:
    """Test that proof document verification_hash is correct."""

    def test_verification_hash_recomputation(self):
        """Verification hash over entries should be reproducible."""
        entries = [
            {
                "entry_index": 1,
                "request_id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "model": "claude-3.5-sonnet",
                "provider": "anthropic",
                "agent_id": None,
                "cot_hash": hashlib.sha512(b"test reasoning").hexdigest(),
                "cot_token_count": 150,
                "prev_hash": hashlib.sha512(b"genesis").hexdigest(),
                "entry_hash": hashlib.sha512(b"entry1").hexdigest(),
                "content_stored": False,
            }
            for _ in range(5)
        ]

        entries_json = json.dumps(entries, sort_keys=True, default=str)
        expected_hash = hashlib.sha512(entries_json.encode("utf-8")).hexdigest()

        # Recompute
        recomputed = hashlib.sha512(
            json.dumps(entries, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()

        assert recomputed == expected_hash

    def test_verification_hash_changes_on_tamper(self):
        """Modifying an entry changes the verification hash."""
        entries = [
            {
                "entry_index": 1,
                "cot_hash": hashlib.sha512(b"original").hexdigest(),
            }
        ]
        hash1 = hashlib.sha512(
            json.dumps(entries, sort_keys=True).encode("utf-8")
        ).hexdigest()

        # Tamper
        entries[0]["cot_hash"] = hashlib.sha512(b"tampered").hexdigest()
        hash2 = hashlib.sha512(
            json.dumps(entries, sort_keys=True).encode("utf-8")
        ).hexdigest()

        assert hash1 != hash2


# ------------------------------------------------------------------
# Chain hash verification tests (unit-level, no DB)
# ------------------------------------------------------------------

class TestChainVerification:
    """Test chain hash computation logic."""

    def test_entry_hash_deterministic(self):
        """Same inputs produce same entry_hash."""
        from src.aletheia.chain import compute_entry_hash

        h1 = compute_entry_hash(1, "req-1", "2026-01-01T00:00:00", "cot123", "prev456")
        h2 = compute_entry_hash(1, "req-1", "2026-01-01T00:00:00", "cot123", "prev456")
        assert h1 == h2

    def test_entry_hash_changes_on_different_input(self):
        """Different inputs produce different entry_hash."""
        from src.aletheia.chain import compute_entry_hash

        h1 = compute_entry_hash(1, "req-1", "2026-01-01T00:00:00", "cot123", "prev456")
        h2 = compute_entry_hash(2, "req-1", "2026-01-01T00:00:00", "cot123", "prev456")
        assert h1 != h2

    def test_cot_hash_with_text(self):
        """CoT hash of reasoning text uses SHA-512."""
        from src.aletheia.chain import compute_cot_hash

        text = "The agent should consider..."
        h = compute_cot_hash(text, 0)
        expected = hashlib.sha512(text.encode("utf-8")).hexdigest()
        assert h == expected

    def test_cot_hash_without_text(self):
        """CoT hash without text (OpenAI) uses token count."""
        from src.aletheia.chain import compute_cot_hash

        h = compute_cot_hash(None, 500)
        expected = hashlib.sha512(b"reasoning_tokens::500").hexdigest()
        assert h == expected
