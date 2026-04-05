"""AuditLogger — records every tool-call attempt and its outcome."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app_proxy.storage.schema import AppProxyAuditLog
from app_proxy.utils.hashing import (
    generate_audit_ref,
    hash_arguments,
    hash_result,
)

logger = structlog.stdlib.get_logger("app_proxy.audit")


class AuditLogger:
    """Async audit logger backed by :class:`AppProxyAuditLog`."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # ------------------------------------------------------------------
    # record_call — create the initial audit row at dispatch time
    # ------------------------------------------------------------------
    async def record_call(
        self,
        *,
        tenant_id: str,
        agent_id: str,
        plugin_name: str,
        tool_name: str,
        call_id: str,
        arguments: dict[str, Any],
        policy_decision: str,
        policy_reason: str,
        approval_id: Optional[str] = None,
        approval_status: Optional[str] = None,
        session_id: Optional[str] = None,
        dispatch_latency_ms: Optional[float] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> str:
        """Insert a new audit record and return its *audit_ref* (row id).

        Arguments are SHA-256 hashed — plaintext is **never** stored.
        """
        audit_ref = generate_audit_ref()
        args_hash = hash_arguments(arguments)

        # Determine initial status from policy decision
        if policy_decision == "deny":
            initial_status = "denied"
        elif policy_decision == "queue_for_approval":
            initial_status = "pending"
        else:
            initial_status = "pending"  # will be updated by record_result

        row = AppProxyAuditLog(
            id=audit_ref,
            tenant_id=tenant_id,
            agent_id=agent_id,
            plugin_name=plugin_name,
            tool_name=tool_name,
            call_id=call_id,
            arguments_hash=args_hash,
            policy_decision=policy_decision,
            policy_reason=policy_reason,
            approval_id=approval_id,
            approval_status=approval_status,
            status=initial_status,
            session_id=session_id,
            dispatch_latency_ms=dispatch_latency_ms,
        )

        async with self._session_factory() as session:
            session.add(row)
            await session.commit()

        logger.info(
            "audit.call.recorded",
            audit_ref=audit_ref,
            call_id=call_id,
            plugin=plugin_name,
            tool=tool_name,
            decision=policy_decision,
        )
        return audit_ref

    # ------------------------------------------------------------------
    # record_result — update the audit row after execution completes
    # ------------------------------------------------------------------
    async def record_result(
        self,
        audit_ref: str,
        *,
        status: str,
        result: Optional[dict[str, Any]] = None,
        error_message: Optional[str] = None,
        plugin_latency_ms: Optional[float] = None,
        total_latency_ms: Optional[float] = None,
    ) -> None:
        """Update an existing audit record with the execution outcome."""
        async with self._session_factory() as session:
            row = await session.get(AppProxyAuditLog, audit_ref)
            if row is None:
                logger.error("audit.result.missing", audit_ref=audit_ref)
                return

            row.status = status
            row.error_message = error_message
            row.plugin_latency_ms = plugin_latency_ms
            row.total_latency_ms = total_latency_ms

            if result is not None:
                row.result_hash = hash_result(result)

            await session.commit()

        logger.info(
            "audit.result.recorded",
            audit_ref=audit_ref,
            status=status,
            plugin_latency_ms=plugin_latency_ms,
        )

    # ------------------------------------------------------------------
    # record_approval — update approval fields on an existing record
    # ------------------------------------------------------------------
    async def record_approval(
        self,
        audit_ref: str,
        *,
        approval_id: str,
        approval_status: str,
        approval_timestamp: Optional[datetime] = None,
    ) -> None:
        """Stamp approval information onto an existing audit record."""
        async with self._session_factory() as session:
            row = await session.get(AppProxyAuditLog, audit_ref)
            if row is None:
                logger.error("audit.approval.missing", audit_ref=audit_ref)
                return

            row.approval_id = approval_id
            row.approval_status = approval_status
            row.approval_timestamp = approval_timestamp or datetime.now(timezone.utc)

            await session.commit()

        logger.info(
            "audit.approval.recorded",
            audit_ref=audit_ref,
            approval_status=approval_status,
        )
