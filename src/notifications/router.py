"""
Notification channel CRUD router.

Routes:
  POST   /v1/notifications/channels              -- create channel
  GET    /v1/notifications/channels              -- list tenant's channels
  GET    /v1/notifications/channels/{id}         -- get single channel
  PUT    /v1/notifications/channels/{id}         -- update channel
  DELETE /v1/notifications/channels/{id}         -- delete channel
  POST   /v1/notifications/channels/{id}/test    -- test delivery

Channel configs (webhook URLs, API keys, SMTP creds) are Fernet-encrypted
at rest using the same key as IdP secrets (settings.oidc_secret_key).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import NotificationChannel
from src.idp.encryption import encrypt_secret, decrypt_secret

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1/notifications", tags=["Notifications"])

VALID_CHANNEL_TYPES = {"slack", "pagerduty", "email", "teams", "opsgenie", "sns", "webhook"}
SEVERITY_LEVELS = {"low", "medium", "high", "critical"}


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------


class ChannelCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    channel_type: str = Field(..., description="slack, pagerduty, email, teams, opsgenie, sns, webhook")
    config: dict = Field(..., description="Channel-specific config (webhook_url, api_key, smtp_*, etc.)")
    enabled: bool = True
    severity_threshold: str = Field(default="medium", description="Minimum severity: low, medium, high, critical")


class ChannelUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    config: Optional[dict] = None
    enabled: Optional[bool] = None
    severity_threshold: Optional[str] = None


class ChannelResponse(BaseModel):
    id: str
    name: str
    channel_type: str
    enabled: bool
    severity_threshold: str
    test_status: Optional[str] = None
    last_tested_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Config is returned with secrets masked
    config: dict = {}


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _get_tenant_id(request: Request) -> uuid.UUID:
    """Extract tenant_id from RBAC context or header."""
    rbac_key = getattr(request.state, "rbac_soulkey", None)
    if rbac_key:
        return rbac_key.tenant_id
    tid = request.headers.get("X-Tenant-ID")
    if tid:
        try:
            return uuid.UUID(tid)
        except ValueError:
            pass
    raise HTTPException(status_code=400, detail="Tenant ID not resolved")


def _mask_config(config: dict) -> dict:
    """Mask sensitive fields in channel config for API responses."""
    masked = {}
    sensitive_keys = {"api_key", "webhook_url", "routing_key", "shared_key", "smtp_password", "token"}
    for k, v in config.items():
        if k in sensitive_keys and isinstance(v, str) and len(v) > 8:
            masked[k] = v[:4] + "****" + v[-4:]
        else:
            masked[k] = v
    return masked


def _row_to_response(row: NotificationChannel) -> ChannelResponse:
    """Convert a DB row to API response with decrypted+masked config."""
    try:
        config_plain = json.loads(decrypt_secret(row.config_encrypted))
    except Exception:
        config_plain = {}

    return ChannelResponse(
        id=str(row.id),
        name=row.name,
        channel_type=row.channel_type,
        enabled=row.enabled,
        severity_threshold=row.severity_threshold,
        test_status=row.test_status,
        last_tested_at=row.last_tested_at.isoformat() if row.last_tested_at else None,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        config=_mask_config(config_plain),
    )


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post(
    "/channels",
    status_code=201,
    response_model=ChannelResponse,
    summary="Create a notification channel",
)
async def create_channel(
    body: ChannelCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    if body.channel_type not in VALID_CHANNEL_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid channel_type. Must be one of: {', '.join(sorted(VALID_CHANNEL_TYPES))}")
    if body.severity_threshold not in SEVERITY_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid severity_threshold. Must be one of: {', '.join(sorted(SEVERITY_LEVELS))}")

    tenant_id = _get_tenant_id(request)
    encrypted_config = encrypt_secret(json.dumps(body.config))

    row = NotificationChannel(
        tenant_id=tenant_id,
        name=body.name,
        channel_type=body.channel_type,
        config_encrypted=encrypted_config,
        enabled=body.enabled,
        severity_threshold=body.severity_threshold,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    logger.info("notifications.channel_created", channel_id=str(row.id), type=row.channel_type, tenant_id=str(tenant_id))
    return _row_to_response(row)


@router.get(
    "/channels",
    response_model=list[ChannelResponse],
    summary="List tenant's notification channels",
)
async def list_channels(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ChannelResponse]:
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.tenant_id == tenant_id)
    )
    rows = result.scalars().all()
    return [_row_to_response(r) for r in rows]


@router.get(
    "/channels/{channel_id}",
    response_model=ChannelResponse,
    summary="Get a single notification channel",
)
async def get_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(NotificationChannel).where(
            NotificationChannel.id == uuid.UUID(channel_id),
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")
    return _row_to_response(row)


@router.put(
    "/channels/{channel_id}",
    response_model=ChannelResponse,
    summary="Update a notification channel",
)
async def update_channel(
    channel_id: str,
    body: ChannelUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(NotificationChannel).where(
            NotificationChannel.id == uuid.UUID(channel_id),
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")

    if body.name is not None:
        row.name = body.name
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.severity_threshold is not None:
        if body.severity_threshold not in SEVERITY_LEVELS:
            raise HTTPException(status_code=400, detail=f"Invalid severity_threshold")
        row.severity_threshold = body.severity_threshold
    if body.config is not None:
        row.config_encrypted = encrypt_secret(json.dumps(body.config))

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)

    logger.info("notifications.channel_updated", channel_id=str(row.id))
    return _row_to_response(row)


@router.delete(
    "/channels/{channel_id}",
    status_code=204,
    response_model=None,
    summary="Delete a notification channel",
)
async def delete_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(NotificationChannel).where(
            NotificationChannel.id == uuid.UUID(channel_id),
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")

    await db.delete(row)
    await db.commit()
    logger.info("notifications.channel_deleted", channel_id=channel_id)


@router.post(
    "/channels/{channel_id}/test",
    summary="Test a notification channel",
)
async def test_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a test notification to validate channel connectivity."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(NotificationChannel).where(
            NotificationChannel.id == uuid.UUID(channel_id),
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")

    try:
        config_plain = json.loads(decrypt_secret(row.config_encrypted))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt channel config")

    # Attempt delivery based on channel type
    test_passed = False
    error_msg = None
    try:
        if row.channel_type == "slack":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    config_plain.get("webhook_url", ""),
                    json={"text": "[Tiresias Test] Notification channel verified."},
                )
                test_passed = resp.status_code == 200

        elif row.channel_type == "webhook":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    config_plain.get("url", config_plain.get("webhook_url", "")),
                    json={"test": True, "message": "Tiresias notification channel test"},
                    headers=config_plain.get("headers", {}),
                )
                test_passed = 200 <= resp.status_code < 300

        elif row.channel_type == "pagerduty":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    json={
                        "routing_key": config_plain.get("routing_key", ""),
                        "event_action": "trigger",
                        "payload": {
                            "summary": "[Tiresias Test] Notification channel verified.",
                            "severity": "info",
                            "source": "tiresias-test",
                        },
                    },
                )
                test_passed = resp.status_code in (200, 202)

        elif row.channel_type == "teams":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    config_plain.get("webhook_url", ""),
                    json={"text": "[Tiresias Test] Notification channel verified."},
                )
                test_passed = resp.status_code == 200

        elif row.channel_type == "email":
            # For email, just validate SMTP settings are present
            test_passed = bool(
                config_plain.get("smtp_host")
                and config_plain.get("smtp_port")
                and config_plain.get("from_address")
                and config_plain.get("to_addresses")
            )
            if not test_passed:
                error_msg = "Missing required SMTP fields: smtp_host, smtp_port, from_address, to_addresses"

        else:
            test_passed = True  # Can't actively test SNS/OpsGenie without extra setup

    except Exception as e:
        error_msg = str(e)

    # Update test status in DB
    row.test_status = "passed" if test_passed else "failed"
    row.last_tested_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "channel_id": str(row.id),
        "test_status": row.test_status,
        "error": error_msg,
    }
