"""Pydantic schemas for license management endpoints."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class IssueLicenseRequest(BaseModel):
    tier: str = Field(..., description="License tier: community, starter, pro, enterprise, mssp, saas")
    tenant_id: Optional[uuid.UUID] = Field(None, description="Target tenant UUID. None for install-level license.")
    features: Optional[list[str]] = Field(None, description="Feature flags to include in the license")
    is_nfr: bool = Field(False, description="Not-for-resale / demo license")
    partner_id: Optional[str] = Field(None, description="Partner identifier")
    validity_days: int = Field(365, ge=1, le=3650, description="License validity in days")


class IssueLicenseResponse(BaseModel):
    license_id: str
    jwt: str = Field(..., description="Signed license JWT. Store securely — shown once.")
    tier: str
    features: list[str]
    is_nfr: bool
    tenant_id: Optional[str]
    partner_id: Optional[str]
    issued_at: str
    expires_at: str
    grace_until: str
    status: str


class LicenseDetail(BaseModel):
    license_id: str
    tier: str
    features: list[str]
    is_nfr: bool
    partner_id: Optional[str]
    issued_at: Optional[str]
    expires_at: Optional[str]
    status: str
    issued_by: Optional[str]
    revoked_at: Optional[str]


class RevokeLicenseRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Reason for revocation")


class RevokeLicenseResponse(BaseModel):
    license_id: str
    status: str
    revoked_by: str


class KEKRotateRequest(BaseModel):
    """Customer provides their new KEK for BYOK envelope re-wrapping."""
    new_kek: str = Field(
        ...,
        description="New KEK value: hex-encoded (64 chars) or base64-encoded 32-byte key",
        min_length=32,
    )
    confirm: bool = Field(
        ...,
        description="Must be true to confirm KEK rotation. This operation re-wraps the DEK.",
    )


class KEKRotateResponse(BaseModel):
    tenant_id: str
    old_provider: str
    new_provider: str
    status: str
    rotated_at: str
