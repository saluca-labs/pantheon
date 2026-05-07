"""Base class for Tiresias App Proxy plugins."""

from __future__ import annotations

from abc import ABC, abstractmethod

from .types import ToolContext, ToolDefinition, ToolResult


class TiresiasPlugin(ABC):
    """Base class for all Tiresias App Proxy plugins.

    Subclass this to build an MCP-compatible plugin that the App Proxy can
    discover, load, and dispatch tool calls to.

    Example::

        class SlackPlugin(TiresiasPlugin):
            name = "slack"
            version = "0.1.0"
            description = "Read and post Slack messages."
            capabilities = ["slack:read", "slack:post"]
            required_secrets = ["SLACK_BOT_TOKEN"]

            def tools(self) -> list[ToolDefinition]:
                return [
                    ToolDefinition(
                        name="slack_post_message",
                        description="Post a message to a Slack channel.",
                        inputSchema={...},
                        annotations={"tiresias:capability": "slack:post"},
                    ),
                ]

            async def call(self, tool_name, arguments, ctx):
                ...
    """

    # ------------------------------------------------------------------
    # Plugin metadata — subclass MUST define these
    # ------------------------------------------------------------------
    name: str
    version: str
    description: str
    capabilities: list[str]
    """Capability tokens this plugin requires (e.g. ["slack:read", "slack:post"])."""

    required_secrets: list[str] = []
    """Secret keys the proxy must inject at runtime (e.g. ["SLACK_BOT_TOKEN"])."""

    # ------------------------------------------------------------------
    # Core interface
    # ------------------------------------------------------------------

    @abstractmethod
    def tools(self) -> list[ToolDefinition]:
        """Return MCP-compatible tool definitions for this plugin."""
        ...

    @abstractmethod
    async def call(self, tool_name: str, arguments: dict, ctx: ToolContext) -> ToolResult:
        """Handle a tool invocation.

        Args:
            tool_name: The name of the tool being called.
            arguments: Parsed arguments matching the tool's inputSchema.
            ctx: Runtime context with secrets, caller identity, logger, and audit.

        Returns:
            A ToolResult containing the response content.
        """
        ...

    # ------------------------------------------------------------------
    # Optional lifecycle hooks
    # ------------------------------------------------------------------

    async def on_install(self, ctx: ToolContext) -> None:
        """Called once when the plugin is first installed for a tenant."""

    async def on_uninstall(self, ctx: ToolContext) -> None:
        """Called when a tenant removes this plugin."""

    async def health_check(self) -> bool:
        """Return True if the plugin is healthy. Override for custom checks."""
        return True
