"""
platform_config — Pydantic Settings-based env validation for Python services.

Usage:
    from platform_config import settings

    print(settings.DATABASE_URL)
"""

from .settings import Settings, get_settings

settings = get_settings()

__all__ = ["Settings", "settings", "get_settings"]
