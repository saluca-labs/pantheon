"""Tiresias Plugin SDK — public API surface.

Import the pieces you need::

    from app_proxy.sdk import TiresiasPlugin, ToolDefinition, ToolContext, ToolResult
    from app_proxy.sdk import mcp_adapter, generate_manifest
"""

from .base import TiresiasPlugin
from .manifest import generate_manifest
from .types import AuditEmitter, ToolContext, ToolDefinition, ToolResult

__all__ = [
    "AuditEmitter",
    "TiresiasPlugin",
    "ToolContext",
    "ToolDefinition",
    "ToolResult",
    "generate_manifest",
]
