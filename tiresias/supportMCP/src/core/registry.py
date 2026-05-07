"""Tool registry — surfaces 7 MCP tools (6 functional + 1 stubbed).

Deployment note (CESO 2026-04-15): `decrypt_content` is stubbed until
Tier 4 MFA step-up (FIDO/WebAuthn) lands. See G.1.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from ..tools import (
    check_quarantine,
    decrypt_content,
    get_policy,
    get_usage,
    query_logs,
    search_kb,
    trace_replay,
)
from .tenant import TenantContext

ToolHandler = Callable[[TenantContext, dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler
    stubbed: bool = False


TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="search_kb",
        description="Semantic search over this tenant's knowledge base.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "sources": {"type": "array", "items": {"type": "string"}},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
        handler=search_kb.handle,
    ),
    ToolSpec(
        name="query_logs",
        description="Query tenant-scoped Cloud Logging + _security_audit.",
        input_schema={
            "type": "object",
            "properties": {
                "since": {"type": "string", "format": "date-time"},
                "until": {"type": "string", "format": "date-time"},
                "level": {"type": "string"},
                "source": {"type": "string"},
                "event_type": {"type": "string"},
                "limit": {"type": "integer", "default": 100},
            },
            "required": ["since"],
        },
        handler=query_logs.handle,
    ),
    ToolSpec(
        name="trace_replay",
        description="Replay a stored LLM trace with current model/policy config.",
        input_schema={
            "type": "object",
            "properties": {"trace_id": {"type": "string"}},
            "required": ["trace_id"],
        },
        handler=trace_replay.handle,
    ),
    ToolSpec(
        name="get_policy",
        description="Return current soulgate policies for tenant/soulkey/model.",
        input_schema={
            "type": "object",
            "properties": {
                "soulkey_id": {"type": "string"},
                "model": {"type": "string"},
            },
        },
        handler=get_policy.handle,
    ),
    ToolSpec(
        name="check_quarantine",
        description="Active quarantines for this tenant.",
        input_schema={"type": "object", "properties": {}},
        handler=check_quarantine.handle,
    ),
    ToolSpec(
        name="get_usage",
        description="Current-period usage from tiresias_usage_buckets.",
        input_schema={
            "type": "object",
            "properties": {"period": {"type": "string", "default": "current"}},
        },
        handler=get_usage.handle,
    ),
    ToolSpec(
        name="decrypt_content",
        description="[STUBBED G.1] Decrypt audit row content — requires MFA step-up.",
        input_schema={
            "type": "object",
            "properties": {
                "audit_row_id": {"type": "string"},
                "step_up_token": {"type": "string"},
            },
            "required": ["audit_row_id"],
        },
        handler=decrypt_content.handle,
        stubbed=True,
    ),
]


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": t.name,
            "description": t.description,
            "inputSchema": t.input_schema,
            "stubbed": t.stubbed,
        }
        for t in TOOLS
    ]


def get_tool(name: str) -> ToolSpec | None:
    for t in TOOLS:
        if t.name == name:
            return t
    return None
