"""
Tests for Fernet encrypt/decrypt round-trip.
"""
import pytest
from unittest.mock import patch
from cryptography.fernet import Fernet


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        key = Fernet.generate_key().decode()
        with patch("src.idp.encryption.get_settings") as mock_settings:
            mock_settings.return_value.oidc_secret_key = key
            from src.idp.encryption import encrypt_secret, decrypt_secret
            ciphertext = encrypt_secret("my-client-secret")
            plaintext = decrypt_secret(ciphertext)
            assert plaintext == "my-client-secret"

    def test_different_ciphertext_each_time(self):
        key = Fernet.generate_key().decode()
        with patch("src.idp.encryption.get_settings") as mock_settings:
            mock_settings.return_value.oidc_secret_key = key
            from src.idp.encryption import encrypt_secret
            c1 = encrypt_secret("same-secret")
            c2 = encrypt_secret("same-secret")
            assert c1 != c2  # Fernet uses random IV

    def test_decrypt_with_wrong_key_raises(self):
        key1 = Fernet.generate_key().decode()
        key2 = Fernet.generate_key().decode()
        with patch("src.idp.encryption.get_settings") as mock_settings:
            mock_settings.return_value.oidc_secret_key = key1
            from src.idp.encryption import encrypt_secret
            ciphertext = encrypt_secret("secret")
        with patch("src.idp.encryption.get_settings") as mock_settings:
            mock_settings.return_value.oidc_secret_key = key2
            from src.idp.encryption import decrypt_secret
            with pytest.raises(ValueError):
                decrypt_secret(ciphertext)

    def test_missing_key_raises_runtime_error(self):
        with patch("src.idp.encryption.get_settings") as mock_settings:
            mock_settings.return_value.oidc_secret_key = None
            from src.idp.encryption import encrypt_secret
            with pytest.raises(RuntimeError):
                encrypt_secret("anything")
