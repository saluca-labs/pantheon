"""
gcp_config.py — GCP Secret Manager helper for patent modules.

Usage:
    from gcp_config import secrets
    key = secrets.get("patent-anthropic-key")

Falls back to env vars if Secret Manager is unavailable (local dev).
Secret names map to env var names via SECRET_ENV_MAP.
"""

import os
from functools import lru_cache
from typing import Optional

PROJECT_ID = os.getenv("GCP_PROJECT", "your-gcp-project")

SECRET_ENV_MAP = {
    "patent-anthropic-key":  "ANTHROPIC_API_KEY",
    "patent-supabase-key":   "SUPABASE_SERVICE_KEY",
    "patent-supabase-url":   "SUPABASE_URL",
    "patent-gcp-project":    "GCP_PROJECT",
}


def _get_from_secret_manager(secret_name: str) -> Optional[str]:
    try:
        from google.cloud import secretmanager
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        val = response.payload.data.decode("UTF-8")
        if val.startswith("REPLACE_WITH"):
            return None
        return val
    except Exception:
        return None


@lru_cache(maxsize=32)
def get(secret_name: str) -> Optional[str]:
    """
    Return secret value. Priority:
      1. GCP Secret Manager
      2. Environment variable (via SECRET_ENV_MAP)
    Returns None if not found.
    """
    val = _get_from_secret_manager(secret_name)
    if val:
        return val
    env_key = SECRET_ENV_MAP.get(secret_name, secret_name.upper().replace("-", "_"))
    return os.getenv(env_key)


def require(secret_name: str) -> str:
    """Like get() but raises RuntimeError if secret is missing."""
    val = get(secret_name)
    if not val:
        env_key = SECRET_ENV_MAP.get(secret_name, secret_name.upper().replace("-", "_"))
        raise RuntimeError(
            f"Secret '{secret_name}' not found. "
            f"Set via Secret Manager or env var {env_key}."
        )
    return val


# Convenience accessors
def anthropic_key() -> str:   return require("patent-anthropic-key")
def supabase_key() -> str:    return require("patent-supabase-key")
def supabase_url() -> str:    return require("patent-supabase-url")
def gcp_project() -> str:     return get("patent-gcp-project") or PROJECT_ID
