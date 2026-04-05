"""SDK types for Tiresias App Proxy plugins."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import structlog


# ---------------------------------------------------------------------------
# Tool definition (MCP-compatible)
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class ToolDefinition:
    """MCP-compatible tool definition exposed by a plugin."""

    name: str
    description: str
    inputSchema: dict[str, Any]
    annotations: dict[str, Any] = field(default_factory=dict)
    """
    Tiresias-specific annotation keys:
      - tiresias:capability   — required capability token (e.g. "slack:post")
      - tiresias:approvalRequired — whether human approval is needed (bool)
      - destructiveHint      — signal that this tool mutates external state (bool)
    """


# ---------------------------------------------------------------------------
# Audit emitter
# ---------------------------------------------------------------------------

class AuditEmitter:
    """Emits structured audit events from plugin code."""

    def __init__(self, plugin_name: str, tenant_id: str, logger: structlog.stdlib.BoundLogger) -> None:
        self._plugin_name = plugin_name
        self._tenant_id = tenant_id
        self._log = logger

    def emit(self, event_type: str, data: dict[str, Any]) -> None:
        """Emit a plugin-level audit event.

        Events are written to the structured log stream where the audit
        pipeline can pick them up for indexing and alerting.
        """
        self._log.info(
            "plugin.audit",
            event_type=event_type,
            plugin=self._plugin_name,
            tenant_id=self._tenant_id,
            **data,
        )


# ---------------------------------------------------------------------------
# Tool invocation context
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class ToolContext:
    """Runtime context injected into every tool invocation."""

    secrets: dict[str, str]
    """Secrets requested by the plugin, injected by the proxy at runtime."""

    caller_agent_id: str
    """Identity of the calling AI agent."""

    caller_tenant_id: str
    """Tenant that owns the calling agent."""

    session_id: Optional[str] = None
    """Optional session correlation id."""

    logger: structlog.stdlib.BoundLogger = field(
        default_factory=lambda: structlog.get_logger()
    )

    audit: AuditEmitter = field(default=None)  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.audit is None:
            self.audit = AuditEmitter(
                plugin_name="unknown",
                tenant_id=self.caller_tenant_id,
                logger=self.logger,
            )


# ---------------------------------------------------------------------------
# Tool result (MCP-compatible)
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class ToolResult:
    """MCP-compatible tool invocation result."""

    content: list[dict[str, Any]]
    """List of content blocks, e.g. [{"type": "text", "text": "..."}]."""

    is_error: bool = False

    # Convenience constructors ------------------------------------------------

    @classmethod
    def text(cls, text: str, *, is_error: bool = False) -> ToolResult:
        """Create a simple text result."""
        return cls(content=[{"type": "text", "text": text}], is_error=is_error)

    @classmethod
    def error(cls, message: str) -> ToolResult:
        """Create an error result."""
        return cls.text(message, is_error=True)
