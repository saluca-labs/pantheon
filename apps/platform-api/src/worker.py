"""
platform-api worker — async background job runner.

Backed by a simple Postgres-native jobs table (`_platform_jobs`) so we don't
introduce a new dependency (Celery/RQ/Arq). Designed for low-volume internal
work: email sending, audit fan-out, license checks, periodic maintenance.

Run:
    python -m src.worker

Required env:
    DATABASE_URL         (required) — same as platform-api
    SESSION_SECRET       (required) — config validation only
    WORKER_POLL_INTERVAL (optional) — seconds between empty polls (default 2.0)
    WORKER_BATCH_SIZE    (optional) — max jobs claimed per tick (default 10)
    WORKER_HEALTH_PORT   (optional) — TCP port for /health/live (default 9100)

Job rows have:
    id            uuid PK
    kind          text — handler key
    payload       jsonb
    status        text — pending|claimed|done|failed
    attempts      int
    max_attempts  int
    run_after     timestamptz
    last_error    text
    created_at    timestamptz
    updated_at    timestamptz

Handlers are registered with `@register("kind")` decorators in
`src.worker_handlers` (auto-imported on startup if present). Unknown kinds
are marked failed with a descriptive error and not retried.
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib
import json
import logging
import os
import signal
import socket
import sys
import time
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = structlog.get_logger("platform.worker")


# ── Handler registry ────────────────────────────────────────────────────────

JobHandler = Callable[[dict], Awaitable[None]]
_HANDLERS: dict[str, JobHandler] = {}


def register(kind: str) -> Callable[[JobHandler], JobHandler]:
    """Decorator: register an async handler for a job kind."""
    def _wrap(fn: JobHandler) -> JobHandler:
        if kind in _HANDLERS:
            raise ValueError(f"Worker handler already registered for kind={kind!r}")
        _HANDLERS[kind] = fn
        return fn
    return _wrap


def get_handler(kind: str) -> Optional[JobHandler]:
    return _HANDLERS.get(kind)


# Built-in handlers — keep this list small; modules register their own.
@register("noop")
async def _noop_handler(payload: dict) -> None:
    """Sanity job — used by smoke tests to prove the worker is alive."""
    logger.info("worker.noop", payload=payload)


# ── Schema bootstrap ────────────────────────────────────────────────────────

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS _platform_jobs (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _platform_jobs_status_run_after_idx
    ON _platform_jobs (status, run_after);
"""


# ── Worker loop ─────────────────────────────────────────────────────────────


@dataclass
class WorkerConfig:
    database_url: str
    poll_interval: float = 2.0
    batch_size: int = 10
    health_port: int = 9100

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise SystemExit("DATABASE_URL is required")
        # Force asyncpg driver if a sync URL is supplied.
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        return cls(
            database_url=url,
            poll_interval=float(os.environ.get("WORKER_POLL_INTERVAL", "2.0")),
            batch_size=int(os.environ.get("WORKER_BATCH_SIZE", "10")),
            health_port=int(os.environ.get("WORKER_HEALTH_PORT", "9100")),
        )


class Worker:
    def __init__(self, config: WorkerConfig):
        self.config = config
        self._engine = create_async_engine(config.database_url, pool_pre_ping=True)
        self._sessionmaker: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self._engine, expire_on_commit=False
        )
        self._stop = asyncio.Event()
        self._health_server: Optional[asyncio.base_events.Server] = None

    # ── lifecycle ─────────────────────────────────────────────────────────

    async def start(self) -> None:
        await self._ensure_schema()
        await self._discover_handlers()
        self._health_server = await self._start_health_server()
        logger.info(
            "worker.started",
            poll_interval=self.config.poll_interval,
            batch_size=self.config.batch_size,
            handlers=sorted(_HANDLERS),
            health_port=self.config.health_port,
        )

    async def shutdown(self) -> None:
        logger.info("worker.shutdown.begin")
        self._stop.set()
        if self._health_server is not None:
            self._health_server.close()
            with contextlib.suppress(Exception):
                await self._health_server.wait_closed()
        await self._engine.dispose()
        logger.info("worker.shutdown.done")

    def request_stop(self) -> None:
        self._stop.set()

    # ── main loop ─────────────────────────────────────────────────────────

    async def run(self) -> None:
        await self.start()
        try:
            while not self._stop.is_set():
                processed = await self._tick()
                if processed == 0:
                    try:
                        await asyncio.wait_for(
                            self._stop.wait(), timeout=self.config.poll_interval
                        )
                    except asyncio.TimeoutError:
                        pass
        finally:
            await self.shutdown()

    async def _tick(self) -> int:
        try:
            jobs = await self._claim_batch()
        except Exception as exc:
            logger.error("worker.claim.error", error=str(exc))
            await asyncio.sleep(self.config.poll_interval)
            return 0

        if not jobs:
            return 0

        for job in jobs:
            await self._execute(job)
        return len(jobs)

    # ── DB ops ────────────────────────────────────────────────────────────

    async def _ensure_schema(self) -> None:
        async with self._engine.begin() as conn:
            for stmt in filter(None, (s.strip() for s in _CREATE_TABLE_SQL.split(";"))):
                await conn.execute(text(stmt))

    async def _claim_batch(self) -> list[dict]:
        """
        Atomically claim up to batch_size pending jobs whose run_after has passed.
        Uses SELECT … FOR UPDATE SKIP LOCKED so multiple workers can run safely.
        """
        sql = text(
            """
            WITH cte AS (
                SELECT id
                FROM _platform_jobs
                WHERE status = 'pending'
                  AND run_after <= now()
                ORDER BY run_after
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            )
            UPDATE _platform_jobs
            SET status = 'claimed', attempts = attempts + 1, updated_at = now()
            FROM cte
            WHERE _platform_jobs.id = cte.id
            RETURNING _platform_jobs.id, _platform_jobs.kind, _platform_jobs.payload,
                      _platform_jobs.attempts, _platform_jobs.max_attempts
            """
        )
        async with self._sessionmaker() as session:
            result = await session.execute(sql, {"limit": self.config.batch_size})
            rows = result.mappings().all()
            await session.commit()
            return [dict(r) for r in rows]

    async def _mark_done(self, job_id: uuid.UUID) -> None:
        async with self._sessionmaker() as session:
            await session.execute(
                text(
                    "UPDATE _platform_jobs SET status='done', updated_at=now() WHERE id=:id"
                ),
                {"id": job_id},
            )
            await session.commit()

    async def _mark_failed(
        self, job_id: uuid.UUID, error: str, retry: bool, backoff_seconds: float
    ) -> None:
        if retry:
            sql = text(
                """
                UPDATE _platform_jobs
                SET status='pending',
                    last_error=:err,
                    run_after=now() + (:backoff || ' seconds')::interval,
                    updated_at=now()
                WHERE id=:id
                """
            )
            params = {"id": job_id, "err": error[:2000], "backoff": str(backoff_seconds)}
        else:
            sql = text(
                """
                UPDATE _platform_jobs
                SET status='failed', last_error=:err, updated_at=now()
                WHERE id=:id
                """
            )
            params = {"id": job_id, "err": error[:2000]}
        async with self._sessionmaker() as session:
            await session.execute(sql, params)
            await session.commit()

    # ── execution ─────────────────────────────────────────────────────────

    async def _execute(self, job: dict) -> None:
        job_id: uuid.UUID = job["id"]
        kind: str = job["kind"]
        payload = job["payload"] or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}

        handler = get_handler(kind)
        if handler is None:
            logger.error("worker.unknown_kind", id=str(job_id), kind=kind)
            await self._mark_failed(job_id, f"no handler registered for kind={kind!r}", retry=False, backoff_seconds=0)
            return

        started = time.monotonic()
        try:
            await handler(payload)
        except Exception as exc:  # pragma: no cover — handler-specific
            elapsed = time.monotonic() - started
            attempts = int(job["attempts"])
            max_attempts = int(job["max_attempts"])
            retry = attempts < max_attempts
            backoff = min(60.0 * (2 ** (attempts - 1)), 600.0)
            logger.error(
                "worker.job.failed",
                id=str(job_id),
                kind=kind,
                attempts=attempts,
                max_attempts=max_attempts,
                will_retry=retry,
                elapsed_ms=int(elapsed * 1000),
                error=str(exc),
            )
            await self._mark_failed(job_id, str(exc), retry=retry, backoff_seconds=backoff)
        else:
            elapsed = time.monotonic() - started
            logger.info(
                "worker.job.done",
                id=str(job_id),
                kind=kind,
                elapsed_ms=int(elapsed * 1000),
            )
            await self._mark_done(job_id)

    # ── handler discovery ─────────────────────────────────────────────────

    async def _discover_handlers(self) -> None:
        """Auto-import optional `src.worker_handlers` if present."""
        try:
            importlib.import_module("src.worker_handlers")
            logger.info("worker.handlers.imported", module="src.worker_handlers")
        except ModuleNotFoundError:
            logger.info("worker.handlers.none_module")

    # ── health endpoint (tiny TCP responder, no FastAPI dep) ──────────────

    async def _start_health_server(self) -> asyncio.base_events.Server:
        async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            try:
                data = await asyncio.wait_for(reader.read(1024), timeout=2.0)
                if b"GET /health/live" in data or b"GET /" in data:
                    body = b'{"status":"ok"}'
                    response = (
                        b"HTTP/1.1 200 OK\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                        b"Connection: close\r\n\r\n" + body
                    )
                else:
                    response = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                writer.write(response)
                await writer.drain()
            except (asyncio.TimeoutError, ConnectionResetError):
                pass
            finally:
                with contextlib.suppress(Exception):
                    writer.close()
                    await writer.wait_closed()

        server = await asyncio.start_server(_handle, host="0.0.0.0", port=self.config.health_port)
        return server


# ── entrypoint ──────────────────────────────────────────────────────────────


def _install_signal_handlers(worker: "Worker", loop: asyncio.AbstractEventLoop) -> None:
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, worker.request_stop)
        except NotImplementedError:  # pragma: no cover — Windows
            pass


async def _amain() -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "info").upper(), stream=sys.stdout)
    config = WorkerConfig.from_env()
    worker = Worker(config)
    loop = asyncio.get_running_loop()
    _install_signal_handlers(worker, loop)
    await worker.run()
    return 0


def main() -> int:
    try:
        return asyncio.run(_amain())
    except KeyboardInterrupt:  # pragma: no cover
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
