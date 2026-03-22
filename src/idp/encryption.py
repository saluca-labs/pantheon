"""
Fernet encryption/decryption for IdP client secrets.
Key source: settings.oidc_secret_key (Fernet base64url key).
"""
import structlog
from cryptography.fernet import Fernet, InvalidToken
from config.settings import get_settings

logger = structlog.get_logger(__name__)


def _get_fernet() -> Fernet:
    """Return a Fernet instance using the configured oidc_secret_key."""
    settings = get_settings()
    key = settings.oidc_secret_key
    if not key:
        raise RuntimeError(
            "SOULAUTH_OIDC_SECRET_KEY is not configured. "
            "Generate with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")
    return Fernet(key.encode())


def encrypt_secret(plaintext: str) -> str:
    """Fernet-encrypt a client secret. Returns URL-safe base64 ciphertext."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Fernet-decrypt a client secret. Raises ValueError on failure."""
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        logger.error("idp_encryption.decrypt_failed")
        raise ValueError("Failed to decrypt client secret -- check SOULAUTH_OIDC_SECRET_KEY") from e


def rotate_secret(old_ciphertext: str, new_plaintext: str) -> str:
    """Decrypt with current key, re-encrypt new plaintext."""
    _old = decrypt_secret(old_ciphertext)  # validates current key works
    return encrypt_secret(new_plaintext)
