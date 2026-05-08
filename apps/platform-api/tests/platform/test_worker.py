"""Unit tests for the platform-api worker (handler registry + execution path)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src import worker as worker_module
from src.worker import Worker, WorkerConfig, get_handler, register


# ── handler registry ────────────────────────────────────────────────────────


def test_register_returns_callable():
    @register("test-registry-1")
    async def _h(payload):
        return None

    assert get_handler("test-registry-1") is _h


def test_register_rejects_duplicate():
    @register("test-registry-2")
    async def _h(payload):
        return None

    with pytest.raises(ValueError, match="already registered"):
        @register("test-registry-2")
        async def _h2(payload):  # noqa: F811
            return None


def test_unknown_handler_returns_none():
    assert get_handler("definitely-not-registered-xyz") is None


def test_noop_handler_registered():
    assert get_handler("noop") is not None


@pytest.mark.asyncio
async def test_noop_handler_runs():
    handler = get_handler("noop")
    assert handler is not None
    await handler({"hello": "world"})  # should not raise


# ── WorkerConfig ────────────────────────────────────────────────────────────


def test_worker_config_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SystemExit):
        WorkerConfig.from_env()


def test_worker_config_normalizes_postgres_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    cfg = WorkerConfig.from_env()
    assert cfg.database_url.startswith("postgresql+asyncpg://")


def test_worker_config_passes_through_asyncpg_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    cfg = WorkerConfig.from_env()
    assert cfg.database_url == "postgresql+asyncpg://u:p@h/db"


def test_worker_config_reads_tunables(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("WORKER_POLL_INTERVAL", "0.5")
    monkeypatch.setenv("WORKER_BATCH_SIZE", "25")
    monkeypatch.setenv("WORKER_HEALTH_PORT", "9101")
    cfg = WorkerConfig.from_env()
    assert cfg.poll_interval == 0.5
    assert cfg.batch_size == 25
    assert cfg.health_port == 9101


# ── execution path ──────────────────────────────────────────────────────────


def _make_worker_with_mocks() -> Worker:
    cfg = WorkerConfig(database_url="postgresql+asyncpg://u:p@h/db")
    # Skip real engine creation; we patch the methods we touch.
    w = Worker.__new__(Worker)
    w.config = cfg
    w._engine = MagicMock()
    w._sessionmaker = MagicMock()
    w._stop = asyncio.Event()
    w._health_server = None
    return w


@pytest.mark.asyncio
async def test_execute_unknown_kind_marks_failed_no_retry():
    w = _make_worker_with_mocks()
    w._mark_failed = AsyncMock()
    job = {
        "id": uuid.uuid4(),
        "kind": "totally-unknown-kind-xyz",
        "payload": {},
        "attempts": 1,
        "max_attempts": 3,
    }
    await w._execute(job)
    w._mark_failed.assert_awaited_once()
    args, kwargs = w._mark_failed.call_args
    assert kwargs.get("retry", args[2] if len(args) > 2 else None) is False


@pytest.mark.asyncio
async def test_execute_success_marks_done():
    w = _make_worker_with_mocks()
    w._mark_done = AsyncMock()
    w._mark_failed = AsyncMock()

    calls = []

    @register("test-success-1")
    async def _h(payload):
        calls.append(payload)

    job = {
        "id": uuid.uuid4(),
        "kind": "test-success-1",
        "payload": {"x": 1},
        "attempts": 1,
        "max_attempts": 3,
    }
    await w._execute(job)
    assert calls == [{"x": 1}]
    w._mark_done.assert_awaited_once()
    w._mark_failed.assert_not_called()


@pytest.mark.asyncio
async def test_execute_failure_retries_when_attempts_remaining():
    w = _make_worker_with_mocks()
    w._mark_done = AsyncMock()
    w._mark_failed = AsyncMock()

    @register("test-failure-1")
    async def _h(payload):
        raise RuntimeError("boom")

    job = {
        "id": uuid.uuid4(),
        "kind": "test-failure-1",
        "payload": {},
        "attempts": 1,
        "max_attempts": 3,
    }
    await w._execute(job)
    w._mark_done.assert_not_called()
    w._mark_failed.assert_awaited_once()
    kwargs = w._mark_failed.call_args.kwargs
    assert kwargs["retry"] is True
    assert kwargs["backoff_seconds"] >= 0


@pytest.mark.asyncio
async def test_execute_failure_no_retry_at_max_attempts():
    w = _make_worker_with_mocks()
    w._mark_done = AsyncMock()
    w._mark_failed = AsyncMock()

    @register("test-failure-2")
    async def _h(payload):
        raise RuntimeError("boom")

    job = {
        "id": uuid.uuid4(),
        "kind": "test-failure-2",
        "payload": {},
        "attempts": 3,
        "max_attempts": 3,
    }
    await w._execute(job)
    kwargs = w._mark_failed.call_args.kwargs
    assert kwargs["retry"] is False


@pytest.mark.asyncio
async def test_tick_zero_jobs_returns_zero():
    w = _make_worker_with_mocks()
    w._claim_batch = AsyncMock(return_value=[])
    n = await w._tick()
    assert n == 0


@pytest.mark.asyncio
async def test_tick_processes_claimed_jobs():
    w = _make_worker_with_mocks()
    job = {
        "id": uuid.uuid4(),
        "kind": "noop",
        "payload": {},
        "attempts": 1,
        "max_attempts": 3,
    }
    w._claim_batch = AsyncMock(return_value=[job])
    w._execute = AsyncMock()
    n = await w._tick()
    assert n == 1
    w._execute.assert_awaited_once_with(job)


@pytest.mark.asyncio
async def test_tick_swallows_claim_errors():
    w = _make_worker_with_mocks()
    w._claim_batch = AsyncMock(side_effect=RuntimeError("db gone"))
    # patch sleep so the test doesn't actually wait
    with patch("src.worker.asyncio.sleep", AsyncMock()):
        n = await w._tick()
    assert n == 0
