"""Plugin registry — discovers, loads, and tracks MCP plugin servers."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

logger = structlog.stdlib.get_logger("app_proxy.plugins.registry")


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------
@dataclass
class ToolDef:
    """Schema definition for a single tool exposed by a plugin."""

    name: str
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)


@dataclass
class PolicyRule:
    """Per-tool policy override defined in plugin config."""

    tool: str
    requires_approval: bool = False
    rate_limit: str | None = None  # e.g. "10/hour"


@dataclass
class PluginConfig:
    """Parsed configuration for a single MCP plugin."""

    name: str
    version: str
    mcp_server_type: str  # "stdio" | "http"
    mcp_server_command: list[str] = field(default_factory=list)
    mcp_server_url: str | None = None  # for http type
    env: dict[str, str] = field(default_factory=dict)
    timeout_seconds: int = 30
    tools: list[ToolDef] = field(default_factory=list)
    policies: dict[str, Any] = field(default_factory=dict)
    policy_rules: list[PolicyRule] = field(default_factory=list)
    acl: dict[str, Any] = field(default_factory=dict)
    healthy: bool = False
    last_health_check: datetime | None = None


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
class PluginRegistry:
    """Central registry of all known MCP plugins.

    Scans a directory for plugin subdirectories, each containing a
    ``config.yaml``.  Provides tool-name-to-plugin resolution and
    aggregated tool listing.
    """

    def __init__(self, plugins_dir: Path) -> None:
        self._plugins_dir = plugins_dir
        self._plugins: dict[str, PluginConfig] = {}
        # tool_name -> plugin_name for O(1) resolution
        self._tool_index: dict[str, str] = {}

    # -- lifecycle ----------------------------------------------------------

    async def load(self) -> None:
        """Scan plugins_dir and load every valid plugin config."""
        from app_proxy.plugins.loader import load_plugin_config

        if not self._plugins_dir.is_dir():
            logger.warning(
                "plugins.dir.missing", path=str(self._plugins_dir)
            )
            return

        for child in sorted(self._plugins_dir.iterdir()):
            if not child.is_dir():
                continue
            config_path = child / "config.yaml"
            if not config_path.exists():
                logger.debug("plugins.skip", dir=child.name, reason="no config.yaml")
                continue
            try:
                plugin = load_plugin_config(child)
                self._plugins[plugin.name] = plugin
                for tool in plugin.tools:
                    self._tool_index[tool.name] = plugin.name
                logger.info(
                    "plugin.loaded",
                    name=plugin.name,
                    version=plugin.version,
                    tools=len(plugin.tools),
                )
            except Exception:
                logger.exception("plugin.load.error", dir=child.name)

    # -- queries ------------------------------------------------------------

    def get_plugin(self, name: str) -> PluginConfig | None:
        return self._plugins.get(name)

    def resolve_tool(self, tool_name: str) -> tuple[PluginConfig, ToolDef] | None:
        """Map a tool name to its owning plugin and tool definition."""
        plugin_name = self._tool_index.get(tool_name)
        if plugin_name is None:
            return None
        plugin = self._plugins[plugin_name]
        for tool in plugin.tools:
            if tool.name == tool_name:
                return plugin, tool
        return None

    def list_tools(self) -> list[dict[str, Any]]:
        """Return every tool across all plugins with attribution."""
        result: list[dict[str, Any]] = []
        for plugin in self._plugins.values():
            for tool in plugin.tools:
                result.append(
                    {
                        "name": tool.name,
                        "plugin": plugin.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema,
                    }
                )
        return result

    def get_plugin_config(self, name: str) -> dict[str, Any] | None:
        """Return a dict with transport fields needed by :class:`MCPClient`.

        Maps the registry ``PluginConfig`` dataclass into the flat dict that
        :pyfunc:`app_proxy.mcp.client.dispatch_tool_call` expects.
        """
        plugin = self._plugins.get(name)
        if plugin is None:
            return None
        return {
            "transport": plugin.mcp_server_type,
            "command": plugin.mcp_server_command or None,
            "url": plugin.mcp_server_url,
            "timeout_seconds": plugin.timeout_seconds,
            "env": plugin.env,
        }

    def list_plugins(self) -> list[dict[str, Any]]:
        """Return summary info for all registered plugins."""
        return [
            {
                "name": p.name,
                "version": p.version,
                "mcp_server_type": p.mcp_server_type,
                "tools": len(p.tools),
                "healthy": p.healthy,
                "last_health_check": (
                    p.last_health_check.isoformat() if p.last_health_check else None
                ),
            }
            for p in self._plugins.values()
        ]

    async def health_check(self) -> dict[str, bool]:
        """Ping each plugin and update health status. Returns plugin_name -> healthy."""
        results: dict[str, bool] = {}
        now = datetime.now(timezone.utc)
        for name, plugin in self._plugins.items():
            # For stdio plugins, just mark healthy if command is set.
            # A real implementation would attempt a JSON-RPC initialize handshake.
            plugin.healthy = bool(plugin.mcp_server_command or plugin.mcp_server_url)
            plugin.last_health_check = now
            results[name] = plugin.healthy
        return results

    def __len__(self) -> int:
        return len(self._plugins)


# ---------------------------------------------------------------------------
# Module-level init / close hooks (called from main.py lifespan)
# ---------------------------------------------------------------------------
async def init_plugin_registry(settings: Any) -> PluginRegistry:
    """Create, load, and health-check the plugin registry."""
    registry = PluginRegistry(settings.plugins_dir)
    await registry.load()
    await registry.health_check()
    return registry


async def close_plugin_registry(registry: PluginRegistry | Any) -> None:
    """Graceful shutdown — placeholder for killing stdio subprocesses."""
    if isinstance(registry, PluginRegistry):
        logger.info("plugin.registry.closed", plugins=len(registry))
