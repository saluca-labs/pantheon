"""
SIEM module-level state -- connector registry and event routing.

SIEMManager holds all configured connectors (syslog + webhook),
routes DetectionEvent objects to matching connectors based on
severity/type filters, and tracks per-connector health status.

Initialized lazily on first use. In production, main.py calls
init_siem() during lifespan to pre-configure connectors from settings.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import structlog

from src.siem.cef import CEFFormatter, DetectionEvent, EventKind
from src.siem.syslog_transport import SyslogTransport, SyslogProtocol
from src.siem.webhook import WebhookRelay, DeliveryRecord

logger = structlog.get_logger(__name__)


class ConnectorKind(str, Enum):
    SYSLOG = "syslog"
    WEBHOOK = "webhook"


class ConnectorStatus(str, Enum):
    CONNECTED = "connected"
    ERROR = "error"
    DISABLED = "disabled"


@dataclass
class ConnectorConfig:
    """
    Tenant-managed connector configuration.
    Stored in-memory by SIEMManager. Each connector has its own
    transport instance and runtime status.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    kind: ConnectorKind = ConnectorKind.SYSLOG
    name: str = ""
    enabled: bool = True

    # Syslog fields
    syslog_host: Optional[str] = None
    syslog_port: int = 514
    syslog_protocol: str = "udp"
    syslog_tls_verify: bool = True
    syslog_tls_ca_cert: Optional[str] = None

    # Webhook fields
    webhook_url: Optional[str] = None
    webhook_headers: dict = field(default_factory=dict)
    webhook_max_retries: int = 3
    webhook_verify_ssl: bool = True

    # Filters -- empty list means "all"
    filter_severity: list = field(default_factory=list)
    filter_event_kind: list = field(default_factory=list)

    # Runtime status (not persisted to config)
    status: ConnectorStatus = ConnectorStatus.DISABLED
    last_event_at: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind.value,
            "name": self.name,
            "enabled": self.enabled,
            "syslog_host": self.syslog_host,
            "syslog_port": self.syslog_port,
            "syslog_protocol": self.syslog_protocol,
            "webhook_url": self.webhook_url,
            "webhook_headers": self.webhook_headers,
            "webhook_max_retries": self.webhook_max_retries,
            "filter_severity": self.filter_severity,
            "filter_event_kind": self.filter_event_kind,
            "status": self.status.value,
            "last_event_at": self.last_event_at,
            "last_error": self.last_error,
            "created_at": self.created_at,
        }

    def _matches_filter(self, event: DetectionEvent) -> bool:
        """Return True if this event passes the connector filters."""
        if self.filter_severity and event.severity_label.lower() not in [s.lower() for s in self.filter_severity]:
            return False
        if self.filter_event_kind and event.kind.value not in [k.lower() for k in self.filter_event_kind]:
            return False
        return True


class SIEMManager:
    """
    Central SIEM routing manager.

    Maintains a registry of ConnectorConfig objects. When route() is called
    with a DetectionEvent, it formats the event as CEF and dispatches to
    all enabled, matching connectors.
    """

    def __init__(self) -> None:
        self._connectors: dict = {}
        self._formatter = CEFFormatter()

    def add_connector(self, config: ConnectorConfig) -> ConnectorConfig:
        """Add or replace a connector. Sets status to CONNECTED if enabled."""
        if config.enabled:
            config.status = ConnectorStatus.CONNECTED
        self._connectors[config.id] = config
        logger.info("siem.connector_added", id=config.id, kind=config.kind.value, name=config.name)
        return config

    def update_connector(self, connector_id: str, updates: dict) -> Optional[ConnectorConfig]:
        """Update fields on an existing connector. Returns None if not found."""
        config = self._connectors.get(connector_id)
        if config is None:
            return None
        for key, value in updates.items():
            if hasattr(config, key) and key not in ("id", "created_at"):
                setattr(config, key, value)
        if config.enabled:
            config.status = ConnectorStatus.CONNECTED
        else:
            config.status = ConnectorStatus.DISABLED
        logger.info("siem.connector_updated", id=connector_id)
        return config

    def remove_connector(self, connector_id: str) -> bool:
        """Remove a connector. Returns True if it existed."""
        if connector_id in self._connectors:
            del self._connectors[connector_id]
            logger.info("siem.connector_removed", id=connector_id)
            return True
        return False

    def get_connector(self, connector_id: str) -> Optional[ConnectorConfig]:
        return self._connectors.get(connector_id)

    def list_connectors(self) -> list:
        return list(self._connectors.values())

    async def route(self, event: DetectionEvent) -> None:
        """
        Route a DetectionEvent to all enabled connectors that match its filters.
        Errors are caught per-connector -- a failing connector does not block others.
        """
        if not self._connectors:
            return

        enabled = [c for c in self._connectors.values() if c.enabled]
        matching = [c for c in enabled if c._matches_filter(event)]

        if not matching:
            return

        cef_string = self._formatter.format(event)
        cef_sev = {"low": 3, "medium": 5, "high": 7, "critical": 10}.get(event.severity_label, 5)
        now_iso = datetime.now(timezone.utc).isoformat()

        for config in matching:
            try:
                if config.kind == ConnectorKind.SYSLOG and config.syslog_host:
                    transport = SyslogTransport(
                        host=config.syslog_host,
                        port=config.syslog_port,
                        protocol=SyslogProtocol(config.syslog_protocol),
                        tls_verify=config.syslog_tls_verify,
                        tls_ca_cert=config.syslog_tls_ca_cert,
                    )
                    success = await transport.send(cef_string, severity_int=cef_sev)
                    if success:
                        config.last_event_at = now_iso
                        config.status = ConnectorStatus.CONNECTED
                        config.last_error = None
                    else:
                        config.status = ConnectorStatus.ERROR
                        config.last_error = "send() returned False"

                elif config.kind == ConnectorKind.WEBHOOK and config.webhook_url:
                    relay = WebhookRelay(
                        url=config.webhook_url,
                        headers=config.webhook_headers,
                        max_retries=config.webhook_max_retries,
                        verify_ssl=config.webhook_verify_ssl,
                    )
                    record = await relay.send(event.to_dict())
                    if record.success:
                        config.last_event_at = now_iso
                        config.status = ConnectorStatus.CONNECTED
                        config.last_error = None
                    else:
                        config.status = ConnectorStatus.ERROR
                        config.last_error = record.last_error

            except Exception as exc:
                config.status = ConnectorStatus.ERROR
                config.last_error = str(exc)
                logger.warning("siem.route_error", connector_id=config.id, error=str(exc))

    async def health(self) -> list:
        """Return health status for all connectors with live connectivity probes."""
        results = []
        for config in self._connectors.values():
            if not config.enabled:
                results.append({
                    "id": config.id,
                    "name": config.name,
                    "kind": config.kind.value,
                    "status": ConnectorStatus.DISABLED.value,
                    "last_event_at": config.last_event_at,
                    "last_error": None,
                })
                continue

            try:
                if config.kind == ConnectorKind.SYSLOG and config.syslog_host:
                    transport = SyslogTransport(
                        host=config.syslog_host,
                        port=config.syslog_port,
                        protocol=SyslogProtocol(config.syslog_protocol),
                        tls_verify=config.syslog_tls_verify,
                    )
                    ok = await transport.health_check()
                elif config.kind == ConnectorKind.WEBHOOK and config.webhook_url:
                    relay = WebhookRelay(
                        url=config.webhook_url,
                        headers=config.webhook_headers,
                        verify_ssl=config.webhook_verify_ssl,
                    )
                    ok = await relay.health_check()
                else:
                    ok = False

                status = ConnectorStatus.CONNECTED if ok else ConnectorStatus.ERROR
                config.status = status
            except Exception as exc:
                config.status = ConnectorStatus.ERROR
                config.last_error = str(exc)
                status = ConnectorStatus.ERROR

            results.append({
                "id": config.id,
                "name": config.name,
                "kind": config.kind.value,
                "status": config.status.value,
                "last_event_at": config.last_event_at,
                "last_error": config.last_error,
            })

        return results


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_siem_manager: Optional[SIEMManager] = None


def init_siem(manager: Optional[SIEMManager] = None) -> SIEMManager:
    """Initialize the global SIEM manager. Creates a new one if not provided."""
    global _siem_manager
    _siem_manager = manager or SIEMManager()
    return _siem_manager


def get_siem_manager() -> SIEMManager:
    """Return the global SIEM manager, creating lazily if needed."""
    global _siem_manager
    if _siem_manager is None:
        _siem_manager = SIEMManager()
    return _siem_manager


def reset_siem() -> None:
    """Clear global state (for testing)."""
    global _siem_manager
    _siem_manager = None
