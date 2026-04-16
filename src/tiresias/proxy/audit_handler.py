"""Hash-chained SECURITY audit handler (Phase B).

On emit, extracts SECURITY event fields from the LogRecord, fetches the most
recent row_hash for the tenant (or 'genesis' for the first row), computes
row_hash = SHA-256(prev_hash || event_type || ts || actor_id || resource_id
|| payload_json), and INSERTs into _security_audit.

Insertion is fire-and-forget via asyncio.create_task. Failures are logged
to stdout at ERROR level WITHOUT recursing through the SECURITY handler.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sys
import time
from typing import Any

_GENESIS = "genesis"
_SECURITY_LEVEL = 45


def _compute_row_hash(
    prev_hash: str,
    event_type: str,
    ts: str,
    actor_id: str,
    resource_id: str,
    payload_json: str,
) -> str:
    h = hashlib.sha256()
    h.update(prev_hash.encode("utf-8"))
    h.update(b"\x1f")
    h.update(event_type.encode("utf-8"))
    h.update(b"\x1f")
    h.update(ts.encode("utf-8"))
    h.update(b"\x1f")
    h.update(actor_id.encode("utf-8"))
    h.update(b"\x1f")
    h.update(resource_id.encode("utf-8"))
    h.update(b"\x1f")
    h.update(payload_json.encode("utf-8"))
    return h.hexdigest()


def _extract_fields(record: logging.LogRecord) -> dict[str, Any]:
    """Extract canonical SECURITY fields from a LogRecord's extra-dict.

    Missing fields get conservative defaults so the chain still links.
    """
    out: dict[str, Any] = {
        "event_type": getattr(record, "event_type", record.name) or "unknown",
        "actor_id": getattr(record, "actor_id", "system") or "system",
        "actor_type": getattr(record, "actor_type", "system") or "system",
        "outcome": getattr(record, "outcome", "success") or "success",
        "resource_type": getattr(record, "resource_type", "log") or "log",
        "resource_id": getattr(record, "resource_id", record.name) or record.name,
        "service": getattr(record, "service", "tiresias-proxy") or "tiresias-proxy",
        "trace_id": getattr(record, "trace_id", None),
        "request_id": getattr(record, "request_id", None),
        "session_id": getattr(record, "session_id", None),
        "tenant_id": getattr(record, "tenant_id", None),
    }
    skip = {
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "message",
        "taskName",
    }
    payload: dict[str, Any] = {"msg": record.getMessage()}
    for k, v in record.__dict__.items():
        if k in skip or k.startswith("_") or k in out:
            continue
        payload[k] = v
    out["payload"] = payload
    return out


class SecurityAuditHandler(logging.Handler):
    """Fire-and-forget handler that writes SECURITY events to _security_audit.

    Only records at level SECURITY (45) are written. For all other records
    the handler is a no-op.
    """

    def __init__(self, engine_factory=None, level: int = _SECURITY_LEVEL) -> None:
        super().__init__(level=level)
        self._engine_factory = engine_factory

    def set_engine_factory(self, engine_factory) -> None:
        self._engine_factory = engine_factory

    def emit(self, record: logging.LogRecord) -> None:
        if record.levelno < _SECURITY_LEVEL:
            return
        if self._engine_factory is None:
            return
        # Valid tenant_id is required (RLS column is NOT NULL uuid).
        tenant_id = getattr(record, "tenant_id", None)
        if not tenant_id or tenant_id == "platform":
            # Platform-level canary events are stdout-only.
            return
        try:
            fields = _extract_fields(record)
            fields["tenant_id"] = tenant_id
            # Normalize ts to ISO string (DB default still wins; this is for hash input).
            fields["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created))
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._insert(fields))
            else:
                # No running loop (e.g. sync bootstrap) — skip silently; startup
                # canary events run before lifespan is active.
                return
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(
                json.dumps({
                    "level": "ERROR",
                    "logger": "tiresias.audit_handler",
                    "msg": "security_audit_emit_failed",
                    "error": str(exc),
                }) + "\n"
            )

    async def _insert(self, fields: dict[str, Any]) -> None:
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession

        from tiresias.storage.engine import set_tenant_context

        tenant_id = fields["tenant_id"]
        try:
            engine = await self._engine_factory()
            async with AsyncSession(engine) as session:
                await set_tenant_context(session, tenant_id)

                result = await session.execute(
                    text(
                        "SELECT row_hash FROM _security_audit "
                        "WHERE tenant_id = :tid ORDER BY id DESC LIMIT 1"
                    ),
                    {"tid": tenant_id},
                )
                last = result.first()
                prev_hash = last[0] if last else _GENESIS

                payload_json = json.dumps(fields["payload"], sort_keys=True, default=str)
                row_hash = _compute_row_hash(
                    prev_hash=prev_hash,
                    event_type=fields["event_type"],
                    ts=fields["ts"],
                    actor_id=fields["actor_id"],
                    resource_id=fields["resource_id"],
                    payload_json=payload_json,
                )

                await session.execute(
                    text(
                        """
                        INSERT INTO _security_audit (
                            tenant_id, ts, event_type, actor_id, actor_type, outcome,
                            resource_type, resource_id, service, trace_id, request_id,
                            session_id, payload, prev_hash, row_hash
                        ) VALUES (
                            :tenant_id, :ts::timestamptz, :event_type, :actor_id, :actor_type, :outcome,
                            :resource_type, :resource_id, :service, :trace_id, :request_id,
                            :session_id, CAST(:payload AS JSONB), :prev_hash, :row_hash
                        )
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "ts": fields["ts"],
                        "event_type": fields["event_type"],
                        "actor_id": fields["actor_id"],
                        "actor_type": fields["actor_type"],
                        "outcome": fields["outcome"],
                        "resource_type": fields["resource_type"],
                        "resource_id": fields["resource_id"],
                        "service": fields["service"],
                        "trace_id": fields["trace_id"],
                        "request_id": fields["request_id"],
                        "session_id": fields["session_id"],
                        "payload": payload_json,
                        "prev_hash": prev_hash,
                        "row_hash": row_hash,
                    },
                )
                await session.commit()
        except Exception as exc:  # noqa: BLE001
            # ERROR to stdout. Must not recurse through SECURITY handler.
            sys.stderr.write(
                json.dumps({
                    "level": "ERROR",
                    "logger": "tiresias.audit_handler",
                    "msg": "security_audit_insert_failed",
                    "error": str(exc),
                    "tenant_id": tenant_id,
                }) + "\n"
            )
