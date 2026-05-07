"""MCP stdio adapter — runs a TiresiasPlugin as a JSON-RPC 2.0 stdio server.

Usage in a plugin's ``__main__.py``::

    from app_proxy.sdk import mcp_adapter
    from my_plugin import MyPlugin

    mcp_adapter.run(MyPlugin())

The adapter reads newline-delimited JSON-RPC requests from **stdin** and writes
responses to **stdout**. This is the transport the App Proxy uses to communicate
with out-of-process plugins.
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import asdict
from typing import Any

import structlog

from .base import TiresiasPlugin
from .types import AuditEmitter, ToolContext, ToolResult

logger = structlog.get_logger("tiresias.sdk.mcp_adapter")

# MCP protocol version we advertise
_MCP_PROTOCOL_VERSION = "2024-11-05"


# ---------------------------------------------------------------------------
# JSON-RPC helpers
# ---------------------------------------------------------------------------

def _ok(id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": id, "result": result}


def _error(id: Any, code: int, message: str, data: Any = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": id, "error": err}


# Standard JSON-RPC error codes
_PARSE_ERROR = -32700
_INVALID_REQUEST = -32600
_METHOD_NOT_FOUND = -32601
_INTERNAL_ERROR = -32603


# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------

def _handle_initialize(plugin: TiresiasPlugin, id: Any) -> dict:
    return _ok(id, {
        "protocolVersion": _MCP_PROTOCOL_VERSION,
        "serverInfo": {
            "name": plugin.name,
            "version": plugin.version,
        },
        "capabilities": {
            "tools": {},
        },
    })


def _handle_tools_list(plugin: TiresiasPlugin, id: Any) -> dict:
    tools = []
    for td in plugin.tools():
        tool: dict[str, Any] = {
            "name": td.name,
            "description": td.description,
            "inputSchema": td.inputSchema,
        }
        if td.annotations:
            tool["annotations"] = td.annotations
        tools.append(tool)
    return _ok(id, {"tools": tools})


async def _handle_tools_call(
    plugin: TiresiasPlugin,
    id: Any,
    params: dict[str, Any],
) -> dict:
    tool_name: str = params.get("name", "")
    arguments: dict = params.get("arguments", {})

    # Build a minimal context — the proxy injects real values via env/config.
    ctx = ToolContext(
        secrets={},
        caller_agent_id="mcp-stdio",
        caller_tenant_id="local",
    )
    ctx.audit = AuditEmitter(
        plugin_name=plugin.name,
        tenant_id=ctx.caller_tenant_id,
        logger=ctx.logger,
    )

    try:
        result: ToolResult = await plugin.call(tool_name, arguments, ctx)
    except Exception as exc:
        logger.error("tool_call_failed", tool=tool_name, error=str(exc))
        return _ok(id, {
            "content": [{"type": "text", "text": f"Internal error: {exc}"}],
            "isError": True,
        })

    return _ok(id, {
        "content": result.content,
        "isError": result.is_error,
    })


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def _serve(plugin: TiresiasPlugin) -> None:
    """Read JSON-RPC requests from stdin, dispatch, write responses to stdout."""
    log = logger.bind(plugin=plugin.name)
    log.info("mcp_stdio_start", version=plugin.version)

    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin.buffer)

    loop = asyncio.get_event_loop()

    while True:
        line = await reader.readline()
        if not line:
            break  # EOF

        line_str = line.decode("utf-8").strip()
        if not line_str:
            continue

        # Parse JSON-RPC request
        try:
            request = json.loads(line_str)
        except json.JSONDecodeError as exc:
            _write(_error(None, _PARSE_ERROR, f"Parse error: {exc}"))
            continue

        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})

        # Notifications (no id) — handle silently
        if req_id is None and method == "notifications/initialized":
            continue

        # Dispatch
        if method == "initialize":
            response = _handle_initialize(plugin, req_id)
        elif method == "tools/list":
            response = _handle_tools_list(plugin, req_id)
        elif method == "tools/call":
            response = await _handle_tools_call(plugin, req_id, params)
        elif req_id is not None:
            response = _error(req_id, _METHOD_NOT_FOUND, f"Unknown method: {method}")
        else:
            # Unknown notification — ignore
            continue

        _write(response)

    log.info("mcp_stdio_shutdown")


def _write(response: dict) -> None:
    """Write a JSON-RPC response to stdout."""
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run(plugin: TiresiasPlugin) -> None:
    """Run a TiresiasPlugin as an MCP stdio server.

    This blocks until stdin is closed. Intended to be called from a plugin's
    ``__main__.py``.
    """
    asyncio.run(_serve(plugin))
