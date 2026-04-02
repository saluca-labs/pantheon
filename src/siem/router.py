"""
SIEM connector configuration API.

Routes:
  POST   /v1/siem/connectors          -- create connector
  GET    /v1/siem/connectors          -- list all connectors
  GET    /v1/siem/connectors/{id}     -- get single connector
  PUT    /v1/siem/connectors/{id}     -- update connector
  DELETE /v1/siem/connectors/{id}     -- delete connector
  GET    /v1/siem/health              -- per-connector health status

Connectors are persisted to _siem_connectors table and synced to the
in-memory SIEMManager for runtime event routing.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SIEMConnector
from src.siem._state import (
    ConnectorConfig,
    ConnectorKind,
    get_siem_manager,
)

router = APIRouter(prefix="/v1/siem", tags=["SIEM"])


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------


class ConnectorCreateRequest(BaseModel):
    kind: ConnectorKind
    name: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True

    # Syslog fields
    syslog_host: Optional[str] = None
    syslog_port: int = Field(default=514, ge=1, le=65535)
    syslog_protocol: str = Field(default="udp", pattern="^(udp|tcp|tls)$")
    syslog_tls_verify: bool = True
    syslog_tls_ca_cert: Optional[str] = None

    # Webhook fields
    webhook_url: Optional[str] = None
    webhook_headers: dict = Field(default_factory=dict)
    webhook_max_retries: int = Field(default=3, ge=0, le=10)
    webhook_verify_ssl: bool = True

    # Filters
    filter_severity: list = Field(default_factory=list)
    filter_event_kind: list = Field(default_factory=list)

    def validate_kind_fields(self) -> None:
        if self.kind == ConnectorKind.SYSLOG and not self.syslog_host:
            raise ValueError("syslog_host is required for syslog connectors")
        if self.kind == ConnectorKind.WEBHOOK and not self.webhook_url:
            raise ValueError("webhook_url is required for webhook connectors")


class ConnectorUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    enabled: Optional[bool] = None
    syslog_host: Optional[str] = None
    syslog_port: Optional[int] = Field(default=None, ge=1, le=65535)
    syslog_protocol: Optional[str] = Field(default=None, pattern="^(udp|tcp|tls)$")
    syslog_tls_verify: Optional[bool] = None
    webhook_url: Optional[str] = None
    webhook_headers: Optional[dict] = None
    webhook_max_retries: Optional[int] = Field(default=None, ge=0, le=10)
    webhook_verify_ssl: Optional[bool] = None
    filter_severity: Optional[list] = None
    filter_event_kind: Optional[list] = None


# ------------------------------------------------------------------
# Helpers: DB row <-> ConnectorConfig
# ------------------------------------------------------------------


def _row_to_config(row: SIEMConnector) -> ConnectorConfig:
    """Convert a DB row to an in-memory ConnectorConfig."""
    cfg = row.config or {}
    return ConnectorConfig(
        id=str(row.id),
        kind=ConnectorKind(row.kind),
        name=row.name,
        enabled=row.enabled,
        syslog_host=cfg.get("syslog_host"),
        syslog_port=cfg.get("syslog_port", 514),
        syslog_protocol=cfg.get("syslog_protocol", "udp"),
        syslog_tls_verify=cfg.get("syslog_tls_verify", True),
        syslog_tls_ca_cert=cfg.get("syslog_tls_ca_cert"),
        webhook_url=cfg.get("webhook_url"),
        webhook_headers=cfg.get("webhook_headers", {}),
        webhook_max_retries=cfg.get("webhook_max_retries", 3),
        webhook_verify_ssl=cfg.get("webhook_verify_ssl", True),
        filter_severity=row.filter_severity or [],
        filter_event_kind=row.filter_event_kind or [],
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


def _build_config_json(req) -> dict:
    """Extract kind-specific fields into a config JSON blob."""
    return {
        "syslog_host": req.syslog_host,
        "syslog_port": req.syslog_port,
        "syslog_protocol": req.syslog_protocol,
        "syslog_tls_verify": getattr(req, "syslog_tls_verify", True),
        "syslog_tls_ca_cert": getattr(req, "syslog_tls_ca_cert", None),
        "webhook_url": req.webhook_url,
        "webhook_headers": req.webhook_headers,
        "webhook_max_retries": req.webhook_max_retries,
        "webhook_verify_ssl": getattr(req, "webhook_verify_ssl", True),
    }


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post(
    "/connectors",
    status_code=status.HTTP_201_CREATED,
    summary="Create a SIEM connector",
)
async def create_connector(
    req: ConnectorCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        req.validate_kind_fields()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    row = SIEMConnector(
        name=req.name,
        kind=req.kind.value,
        enabled=req.enabled,
        config=_build_config_json(req),
        filter_severity=req.filter_severity,
        filter_event_kind=req.filter_event_kind,
        # tenant_id will be set from middleware context in production;
        # for now default to a placeholder if not available
        tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Sync to in-memory manager for runtime routing
    config = _row_to_config(row)
    get_siem_manager().add_connector(config)

    return config.to_dict()


@router.get(
    "/connectors",
    summary="List all SIEM connectors",
)
async def list_connectors(db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(SIEMConnector))
    rows = result.scalars().all()
    connectors = [_row_to_config(r).to_dict() for r in rows]
    return {"connectors": connectors, "total": len(connectors)}


@router.get(
    "/connectors/{connector_id}",
    summary="Get a single SIEM connector",
)
async def get_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(SIEMConnector).where(SIEMConnector.id == uuid.UUID(connector_id))
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")
    return _row_to_config(row).to_dict()


@router.put(
    "/connectors/{connector_id}",
    summary="Update a SIEM connector",
)
async def update_connector(
    connector_id: str,
    req: ConnectorUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(SIEMConnector).where(SIEMConnector.id == uuid.UUID(connector_id))
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    config_fields = {
        "syslog_host", "syslog_port", "syslog_protocol", "syslog_tls_verify",
        "webhook_url", "webhook_headers", "webhook_max_retries", "webhook_verify_ssl",
    }

    # Separate DB-column updates from config-JSON updates
    new_config = dict(row.config or {})
    for key in list(updates.keys()):
        if key in config_fields:
            new_config[key] = updates.pop(key)

    if "name" in updates:
        row.name = updates["name"]
    if "enabled" in updates:
        row.enabled = updates["enabled"]
    if "filter_severity" in updates:
        row.filter_severity = updates["filter_severity"]
    if "filter_event_kind" in updates:
        row.filter_event_kind = updates["filter_event_kind"]

    row.config = new_config
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)

    # Sync to in-memory manager
    config = _row_to_config(row)
    mgr = get_siem_manager()
    mgr.update_connector(str(row.id), config.to_dict()) or mgr.add_connector(config)

    return config.to_dict()


@router.delete(
    "/connectors/{connector_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete a SIEM connector",
)
async def delete_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(SIEMConnector).where(SIEMConnector.id == uuid.UUID(connector_id))
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")

    await db.execute(
        delete(SIEMConnector).where(SIEMConnector.id == uuid.UUID(connector_id))
    )
    await db.commit()

    # Remove from in-memory manager
    get_siem_manager().remove_connector(connector_id)


@router.get(
    "/health",
    summary="SIEM connector health status",
)
async def siem_health() -> dict:
    mgr = get_siem_manager()
    results = await mgr.health()
    return {
        "connectors": results,
        "total": len(results),
        "healthy": sum(1 for r in results if r["status"] == "connected"),
        "degraded": sum(1 for r in results if r["status"] == "error"),
        "disabled": sum(1 for r in results if r["status"] == "disabled"),
    }
