"""Pydantic schemas for white-label branding configuration (WL-01)."""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, field_validator
import re


_HEX_COLOR_RE = re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")


class BrandingConfig(BaseModel):
    """
    Per-tenant branding configuration stored in SoulTenant.metadata_["branding"].
    All fields are optional -- unset fields fall back to Tiresias defaults in the portal.
    """
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    company_name: Optional[str] = None
    favicon_url: Optional[str] = None

    @field_validator("primary_color", "accent_color", mode="before")
    @classmethod
    def validate_hex_color(cls, v):
        if v is None:
            return v
        if not _HEX_COLOR_RE.match(v):
            raise ValueError(f"Color must be a CSS hex value like #RRGGBB, got: {v!r}")
        return v

    @field_validator("company_name", mode="before")
    @classmethod
    def validate_company_name(cls, v):
        if v is None:
            return v
        stripped = v.strip()
        if len(stripped) > 120:
            raise ValueError("company_name must be 120 characters or fewer")
        return stripped

    model_config = {"extra": "ignore"}


class BrandingResponse(BaseModel):
    """API response wrapping BrandingConfig with the owning tenant_id."""
    tenant_id: str
    branding: BrandingConfig
