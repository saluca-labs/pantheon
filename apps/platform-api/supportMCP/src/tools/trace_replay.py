"""trace_replay — replay a stored LLM trace with current model/policy config.

Reads from the real Aletheia tables (verified in
soulWatch/src/database/models.py):
  - aletheia_cot_chain      (hash-chained CoT entries, model/provider meta)
  - aletheia_tool_invocations (tool call sequence, policy verdicts)

RLS scopes the read to the tenant. Replay itself is deterministic-metadata
only in the scaffold — actual re-execution against current models happens
in Phase G.1 once policy injection is wired.

Semantic change vs. the prior placeholder scaffold query:
  - Output `events` is now a merged/ordered sequence of two event kinds:
      {"kind": "cot", "ts", "model", "provider", "entry_index",
       "cot_hash", "content_stored"}
      {"kind": "tool", "ts", "command", "policy_verdict",
       "policy_rule_matched", "exit_code"}
  - `trace_id` is matched against `aletheia_cot_chain.request_id`
    (UUID) AND `aletheia_tool_invocations.invocation_id` (string).
    Callers upstream of G.1 must be updated to this shape.
"""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext, with_tenant_scope


async def handle(ctx: TenantContext, params: dict[str, Any], *, conn=None) -> dict[str, Any]:
    trace_id = params["trace_id"]
    events: list[dict[str, Any]] = []

    if conn is not None:
        async with with_tenant_scope(conn, ctx) as scoped:
            # CoT chain entries tied to this trace (request_id is UUID).
            cot_sql = (
                "SELECT timestamp AS ts, model, provider, entry_index, "
                "cot_hash, content_stored "
                "FROM aletheia_cot_chain "
                "WHERE request_id::text = $1 "
                "ORDER BY entry_index ASC"
            )
            cot_rows = await scoped.fetch(cot_sql, trace_id)

            # Tool invocations tied to this trace (invocation_id is the
            # scaffold's trace correlation key).
            tool_sql = (
                "SELECT timestamp AS ts, command, policy_verdict, "
                "policy_rule_matched, exit_code "
                "FROM aletheia_tool_invocations "
                "WHERE invocation_id = $1 "
                "ORDER BY timestamp ASC"
            )
            tool_rows = await scoped.fetch(tool_sql, trace_id)

            for r in cot_rows:
                d = dict(r)
                d["kind"] = "cot"
                events.append(d)
            for r in tool_rows:
                d = dict(r)
                d["kind"] = "tool"
                events.append(d)

            # Merge order by timestamp so the replay reflects real sequencing.
            events.sort(key=lambda e: (e.get("ts") is None, e.get("ts")))

    return {
        "tenant_id": str(ctx.tenant_id),
        "trace_id": trace_id,
        "events": events,
        "replay_executed": False,
        "note": "scaffold: metadata-only replay; live re-execution lands in G.1",
    }
