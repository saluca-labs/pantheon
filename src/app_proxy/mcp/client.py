"""MCP client — dispatches tool calls to plugins over stdio or HTTP transport."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
import structlog

logger = structlog.stdlib.get_logger("app_proxy.mcp.client")


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class MCPResult:
    """Outcome of dispatching a single tool call to an MCP plugin."""

    success: bool
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: float = 0.0


# ---------------------------------------------------------------------------
# Plugin config type (duck-typed — callers may pass a dict or dataclass)
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class PluginConfig:
    """Minimal plugin transport configuration."""

    transport: str  # "stdio" or "http"
    command: Optional[list[str]] = None  # for stdio: ["node", "server.js"]
    url: Optional[str] = None  # for http: "http://localhost:3001"
    timeout_seconds: int = 30
    env: dict[str, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# JSON-RPC helpers
# ---------------------------------------------------------------------------
def _build_request(tool_name: str, arguments: dict[str, Any]) -> bytes:
    """Build a JSON-RPC 2.0 ``tools/call`` request."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }
    return (json.dumps(payload) + "\n").encode("utf-8")


def _parse_response(raw: str) -> MCPResult:
    """Parse a JSON-RPC 2.0 response into an :class:`MCPResult`."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return MCPResult(success=False, error=f"JSON parse error: {exc}")

    if "error" in data:
        err = data["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        return MCPResult(success=False, error=msg)

    return MCPResult(success=True, result=data.get("result"))


# ---------------------------------------------------------------------------
# MCPClient
# ---------------------------------------------------------------------------
class MCPClient:
    """Dispatch tool calls to MCP-compliant plugins via stdio or HTTP."""

    def __init__(self, default_timeout: int = 30) -> None:
        self._default_timeout = default_timeout

    # ------------------------------------------------------------------
    # Public dispatch entry point
    # ------------------------------------------------------------------
    async def dispatch_tool_call(
        self,
        plugin_config: PluginConfig | dict[str, Any],
        tool_name: str,
        arguments: dict[str, Any],
    ) -> MCPResult:
        """Dispatch *tool_name* to the plugin described by *plugin_config*.

        Returns an :class:`MCPResult` with success/error and latency.
        """
        # Normalise dict configs
        if isinstance(plugin_config, dict):
            plugin_config = PluginConfig(**plugin_config)

        timeout = plugin_config.timeout_seconds or self._default_timeout

        t0 = time.perf_counter()
        try:
            if plugin_config.transport == "stdio":
                result = await self._dispatch_stdio(plugin_config, tool_name, arguments, timeout)
            elif plugin_config.transport == "http":
                result = await self._dispatch_http(plugin_config, tool_name, arguments, timeout)
            else:
                result = MCPResult(
                    success=False,
                    error=f"Unsupported transport: {plugin_config.transport}",
                )
        except asyncio.TimeoutError:
            elapsed = (time.perf_counter() - t0) * 1000
            logger.warning(
                "mcp.dispatch.timeout",
                tool=tool_name,
                transport=plugin_config.transport,
                timeout_s=timeout,
            )
            return MCPResult(success=False, error="timeout", latency_ms=elapsed)
        except Exception as exc:
            elapsed = (time.perf_counter() - t0) * 1000
            logger.exception(
                "mcp.dispatch.error",
                tool=tool_name,
                transport=plugin_config.transport,
            )
            return MCPResult(success=False, error=str(exc), latency_ms=elapsed)

        elapsed = (time.perf_counter() - t0) * 1000
        # Attach measured latency
        result = MCPResult(
            success=result.success,
            result=result.result,
            error=result.error,
            latency_ms=elapsed,
        )

        logger.info(
            "mcp.dispatch.complete",
            tool=tool_name,
            transport=plugin_config.transport,
            success=result.success,
            latency_ms=round(result.latency_ms, 2),
        )
        return result

    # ------------------------------------------------------------------
    # stdio transport
    # ------------------------------------------------------------------
    async def _dispatch_stdio(
        self,
        config: PluginConfig,
        tool_name: str,
        arguments: dict[str, Any],
        timeout: int,
    ) -> MCPResult:
        """Spawn the plugin process, write JSON-RPC to stdin, read from stdout."""
        if not config.command:
            return MCPResult(success=False, error="stdio transport requires 'command'")

        request_bytes = _build_request(tool_name, arguments)

        proc = await asyncio.create_subprocess_exec(
            *config.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**config.env} if config.env else None,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=request_bytes),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise

        if proc.returncode != 0:
            err_text = stderr.decode("utf-8", errors="replace").strip()
            return MCPResult(
                success=False,
                error=f"Plugin exited with code {proc.returncode}: {err_text}",
            )

        raw = stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            return MCPResult(success=False, error="Empty response from plugin")

        # Take the last complete JSON line (plugins may emit logs before the response)
        last_line = raw.splitlines()[-1]
        return _parse_response(last_line)

    # ------------------------------------------------------------------
    # HTTP transport
    # ------------------------------------------------------------------
    async def _dispatch_http(
        self,
        config: PluginConfig,
        tool_name: str,
        arguments: dict[str, Any],
        timeout: int,
    ) -> MCPResult:
        """POST JSON-RPC to the plugin's HTTP endpoint."""
        if not config.url:
            return MCPResult(success=False, error="http transport requires 'url'")

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                config.url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()

        return _parse_response(resp.text)


# ---------------------------------------------------------------------------
# Module-level convenience function
# ---------------------------------------------------------------------------
_default_client = MCPClient()


async def dispatch_tool_call(
    plugin_config: PluginConfig | dict[str, Any],
    tool_name: str,
    arguments: dict[str, Any],
) -> MCPResult:
    """Module-level shortcut — dispatch via the shared :class:`MCPClient`.

    *plugin_config* may be a :class:`PluginConfig`, a dict with matching
    keys, or a registry-style dict with ``transport``, ``command``, ``url``,
    ``timeout_seconds``, ``env``.
    """
    return await _default_client.dispatch_tool_call(plugin_config, tool_name, arguments)
