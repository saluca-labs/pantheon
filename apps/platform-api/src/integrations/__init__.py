"""
SIEM and log forwarding integrations for SoulAuth.
Enables forwarding audit events to enterprise security infrastructure.
"""

from src.integrations.cef import format_cef, AuditEvent
from src.integrations.siem import (
    SIEMForwarder,
    SplunkHECForwarder,
    ElasticForwarder,
    SyslogForwarder,
    WebhookForwarder,
    AzureSentinelForwarder,
)
from src.integrations.forwarder import EventForwarder
from src.integrations.config import (
    SIEMDestinationConfig,
    SplunkConfig,
    ElasticConfig,
    SyslogConfig,
    WebhookConfig,
    AzureSentinelConfig,
)

__all__ = [
    "AuditEvent",
    "format_cef",
    "SIEMForwarder",
    "SplunkHECForwarder",
    "ElasticForwarder",
    "SyslogForwarder",
    "WebhookForwarder",
    "AzureSentinelForwarder",
    "EventForwarder",
    "SIEMDestinationConfig",
    "SplunkConfig",
    "ElasticConfig",
    "SyslogConfig",
    "WebhookConfig",
    "AzureSentinelConfig",
]
