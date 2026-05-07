"""
Async batch request/response audit logging.
Queue-based with periodic flush to database.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.config.settings import get_settings
from soulGate.src.database.models import SoulGateRequestLog

logger = structlog.get_logger(__name__)
settings = get_settings()

# Async queue for audit log entries
_audit_queue: asyncio.Queue = asyncio.Queue()
_flush_task: Optional[asyncio.Task] = None
_session_factory = None


async def enqueue_log_entry(
    tenant_id: Optional[uuid.UUID] = None,
    soulkey_id: Optional[uuid.UUID] = None,
    persona_id: Optional[str] = None,
    api_key_id: Optional[uuid.UUID] = None,
    method: str = "",
    path: str = "",
    request_size_bytes: Optional[int] = None,
    response_status: Optional[int] = None,
    response_size_bytes: Optional[int] = None,
    response_time_ms: Optional[float] = None,
    upstream_name: Optional[str] = None,
    blocked: bool = False,
    block_reason: Optional[str] = None,
    threat_flags: Optional[dict] = None,
    source_ip: Optional[str] = None,
):
    """Enqueue an audit log entry for batch insertion."""
    entry = SoulGateRequestLog(
        tenant_id=tenant_id,
        soulkey_id=soulkey_id,
        persona_id=persona_id,
        api_key_id=api_key_id,
        method=method,
        path=path,
        request_size_bytes=request_size_bytes,
        response_status=response_status,
        response_size_bytes=response_size_bytes,
        response_time_ms=response_time_ms,
        upstream_name=upstream_name,
        blocked=blocked,
        block_reason=block_reason,
        threat_flags=threat_flags,
        source_ip=source_ip,
    )
    await _audit_queue.put(entry)


async def _flush_batch():
    """Flush queued audit log entries to the database."""
    if _session_factory is None:
        return

    entries = []
    while not _audit_queue.empty() and len(entries) < settings.audit_batch_size:
        try:
            entry = _audit_queue.get_nowait()
            entries.append(entry)
        except asyncio.QueueEmpty:
            break

    if not entries:
        return

    try:
        async with _session_factory() as db:
            db.add_all(entries)
            await db.commit()
            logger.debug("audit.flushed", count=len(entries))
    except Exception as e:
        logger.error("audit.flush_failed", error=str(e), count=len(entries))
        # Re-queue failed entries (best effort)
        for entry in entries:
            try:
                _audit_queue.put_nowait(entry)
            except asyncio.QueueFull:
                break


async def _flush_loop():
    """Background loop that periodically flushes audit entries."""
    while True:
        try:
            await asyncio.sleep(settings.audit_flush_interval)
            await _flush_batch()
        except asyncio.CancelledError:
            # Final flush on shutdown
            await _flush_batch()
            break
        except Exception as e:
            logger.error("audit.flush_loop_error", error=str(e))


def start_audit_logger(session_factory):
    """Start the background audit log flusher."""
    global _session_factory, _flush_task
    _session_factory = session_factory
    _flush_task = asyncio.create_task(_flush_loop())
    logger.info(
        "audit.started",
        batch_size=settings.audit_batch_size,
        flush_interval=settings.audit_flush_interval,
    )


async def stop_audit_logger():
    """Stop the background audit log flusher and perform final flush."""
    global _flush_task
    if _flush_task:
        _flush_task.cancel()
        try:
            await _flush_task
        except asyncio.CancelledError:
            pass
        _flush_task = None
    # Final flush
    await _flush_batch()
    logger.info("audit.stopped")


def get_queue_size() -> int:
    """Get current audit queue size."""
    return _audit_queue.qsize()
