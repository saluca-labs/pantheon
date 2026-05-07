"""MCP client package — dispatch tool calls to plugin servers."""

from app_proxy.mcp.client import MCPClient, MCPResult, dispatch_tool_call

__all__ = ["MCPClient", "MCPResult", "dispatch_tool_call"]
