"""
SIEM connector configuration API.

Routes:
  POST   /v1/siem/connectors          -- create connector
  GET    /v1/siem/connectors          -- list all connectors
  GET    /v1/siem/connectors/{id}     -- get single connector
  PUT    /v1/siem/connectors/{id}     -- update connector
  DELETE /v1/siem/connectors/{id}     -- delete connector
  GET    /v1/siem/health              -- per-connector health status

All endpoints require X-SoulKey header (enforced by SoulAuthPEPMiddleware).
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

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
        """Raise ValueError if required fields for the kind are missing."""
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
# Endpoints
# ------------------------------------------------------------------

@router.post(
    "/connectors",
    status_code=status.HTTP_201_CREATED,
    summary="Create a SIEM connector",
    description="Configure a new syslog or webhook connector. Events will be forwarded to this endpoint based on filter criteria.",
)
async def create_connector(req: ConnectorCreateRequest) -> dict:
    try:
        req.validate_kind_fields()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    mgr = get_siem_manager()
    config = ConnectorConfig(
        kind=req.kind,
        name=req.name,
        enabled=req.enabled,
        syslog_host=req.syslog_host,
        syslog_port=req.syslog_port,
        syslog_protocol=req.syslog_protocol,
        syslog_tls_verify=req.syslog_tls_verify,
        syslog_tls_ca_cert=req.syslog_tls_ca_cert,
        webhook_url=req.webhook_url,
        webhook_headers=req.webhook_headers,
        webhook_max_retries=req.webhook_max_retries,
        webhook_verify_ssl=req.webhook_verify_ssl,
        filter_severity=req.filter_severity,
        filter_event_kind=req.filter_event_kind,
    )
    mgr.add_connector(config)
    return config.to_dict()


@router.get(
    "/connectors",
    summary="List all SIEM connectors",
)
async def list_connectors() -> dict:
    mgr = get_siem_manager()
    connectors = mgr.list_connectors()
    return {
        "connectors": [c.to_dict() for c in connectors],
        "total": len(connectors),
    }


@router.get(
    "/connectors/{connector_id}",
    summary="Get a single SIEM connector",
)
async def get_connector(connector_id: str) -> dict:
    mgr = get_siem_manager()
    config = mgr.get_connector(connector_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")
    return config.to_dict()


@router.put(
    "/connectors/{connector_id}",
    summary="Update a SIEM connector",
)
async def update_connector(connector_id: str, req: ConnectorUpdateRequest) -> dict:
    mgr = get_siem_manager()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    config = mgr.update_connector(connector_id, updates)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")
    return config.to_dict()


@router.delete(
    "/connectors/{connector_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete a SIEM connector",
)
async def delete_connector(connector_id: str) -> None:
    mgr = get_siem_manager()
    removed = mgr.remove_connector(connector_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")


@router.get(
    "/health",
    summary="SIEM connector health status",
    description="Returns connectivity status and last event timestamp for each configured connector.",
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
