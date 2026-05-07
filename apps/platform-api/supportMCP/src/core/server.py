"""MCP JSON-RPC surface — HTTP transport + stdio loop.

Minimal MCP protocol implementation: `initialize`, `tools/list`, `tools/call`.
Intentionally hand-rolled (no official SDK dep) so the scaffold is portable.
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import get_settings
from .registry import TOOLS, get_tool, list_tools
from .tenant import TenantContext, TenantScopeError


def _extract_soulkey(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    # Dev-mode fallback header.
    return request.headers.get("x-soulkey", "").strip()


async def _handle_jsonrpc(msg: dict[str, Any], *, soulkey: str | None = None) -> dict[str, Any]:
    method = msg.get("method")
    mid = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": mid,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "tiresias-support-mcp", "version": "0.1.0-scaffold"},
                "capabilities": {"tools": {}},
            },
        }

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": list_tools()}}

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        tool = get_tool(name)
        if tool is None:
            return {
                "jsonrpc": "2.0",
                "id": mid,
                "error": {"code": -32601, "message": f"unknown tool: {name}"},
            }
        try:
            ctx = TenantContext.from_soulkey(
                soulkey or args.pop("_soulkey", ""),
                deployment_scope=get_settings().support_mcp_tenant_scope or None,
            )
        except TenantScopeError as exc:
            return {
                "jsonrpc": "2.0",
                "id": mid,
                "error": {"code": -32001, "message": f"tenant scope: {exc}"},
            }
        try:
            result = await tool.handler(ctx, args)
        except Exception as exc:  # pragma: no cover — defensive
            return {
                "jsonrpc": "2.0",
                "id": mid,
                "error": {"code": -32000, "message": f"tool error: {exc}"},
            }
        return {
            "jsonrpc": "2.0",
            "id": mid,
            "result": {"content": [{"type": "json", "json": result}]},
        }

    return {
        "jsonrpc": "2.0",
        "id": mid,
        "error": {"code": -32601, "message": f"unknown method: {method}"},
    }


def build_app() -> FastAPI:
    app = FastAPI(title="Tiresias Support MCP", version="0.1.0-scaffold")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "tools": len(TOOLS)}

    @app.post("/mcp")
    async def mcp(request: Request) -> JSONResponse:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(400, f"bad json: {exc}") from exc
        soulkey = _extract_soulkey(request)
        response = await _handle_jsonrpc(body, soulkey=soulkey)
        return JSONResponse(response)

    return app


async def run_stdio() -> None:
    """Simple stdio JSON-RPC loop for local dev / Claude Code wiring."""
    loop = asyncio.get_event_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        resp = await _handle_jsonrpc(msg)
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


app = build_app()
