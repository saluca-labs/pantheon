"""Pydantic schemas for investigation access workflow."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class EvidenceQuery(BaseModel):
    tenant_id: uuid.UUID
    start_time: datetime
    end_time: datetime
    session_id: Optional[str] = None
    limit: int = Field(100, ge=1, le=1000)


class EvidenceHashResult(BaseModel):
    """Level 0: Hash-only evidence record."""
    record_id: str
    request_hash: Optional[str]
    response_hash: Optional[str]
    model: Optional[str]
    created_at: str


class EvidenceContextResult(BaseModel):
    """Level 1: Context with metadata but no plaintext."""
    record_id: str
    request_hash: Optional[str]
    response_hash: Optional[str]
    model: Optional[str]
    provider: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    cost_usd: Optional[float]
    session_id: Optional[str]
    created_at: str


class EvidenceCleartextResult(BaseModel):
    """Level 2: Full cleartext (requires one-time token)."""
    record_id: str
    prompt: Optional[str]
    completion: Optional[str]
    model: Optional[str]
    provider: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    cost_usd: Optional[float]
    session_id: Optional[str]
    request_hash: Optional[str]
    response_hash: Optional[str]
    created_at: str
    integrity_hash: str = Field(description="SHA-256 of the decrypted content for tamper verification")


class CreateAccessTokenRequest(BaseModel):
    tenant_id: uuid.UUID
    purpose: str = Field(..., description="Reason for access — logged in audit trail")
    ttl_minutes: int = Field(60, ge=5, le=1440, description="Token validity in minutes")


class CreateAccessTokenResponse(BaseModel):
    token: str = Field(description="One-time access token. Shown once — store securely.")
    token_id: str
    expires_at: str
    purpose: str
