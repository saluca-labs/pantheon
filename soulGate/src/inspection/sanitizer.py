"""
Request sanitization utilities.
Cleans and normalizes request data before forwarding upstream.
"""

import re
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)


def sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    """
    Remove potentially dangerous headers before forwarding.
    Strips internal/hop-by-hop headers and injection attempts.
    """
    blocked_headers = {
        "host",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "upgrade",
    }
    # Also block any header with newline injection
    sanitized = {}
    for key, value in headers.items():
        key_lower = key.lower()
        if key_lower in blocked_headers:
            continue
        # Prevent header injection via CRLF
        if "\r" in value or "\n" in value:
            logger.warning("sanitizer.crlf_header", header=key)
            continue
        sanitized[key] = value

    return sanitized


def sanitize_path(path: str) -> str:
    """
    Sanitize URL path to prevent directory traversal and injection.
    """
    # Remove directory traversal
    sanitized = path.replace("../", "").replace("..\\", "")
    # Remove null bytes
    sanitized = sanitized.replace("\x00", "")
    # Collapse multiple slashes
    sanitized = re.sub(r"/{2,}", "/", sanitized)
    return sanitized


def sanitize_query_params(params: dict[str, str]) -> dict[str, str]:
    """Remove potentially dangerous characters from query parameters."""
    sanitized = {}
    for key, value in params.items():
        # Strip null bytes and control characters
        clean_key = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", key)
        clean_value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value)
        sanitized[clean_key] = clean_value
    return sanitized


def redact_sensitive_fields(
    data: dict,
    sensitive_keys: Optional[set[str]] = None,
) -> dict:
    """
    Redact sensitive field values in a dict for logging purposes.
    Does NOT modify the original dict.
    """
    if sensitive_keys is None:
        sensitive_keys = {
            "password", "secret", "token", "api_key", "apikey",
            "authorization", "credit_card", "ssn", "key_hash",
        }

    redacted = {}
    for key, value in data.items():
        if key.lower() in sensitive_keys:
            redacted[key] = "***REDACTED***"
        elif isinstance(value, dict):
            redacted[key] = redact_sensitive_fields(value, sensitive_keys)
        else:
            redacted[key] = value
    return redacted
