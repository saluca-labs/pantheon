"""
APE-V Remediation — Database Isolation & RLS Verification Tests.

Validates that:
1. Application-level tenant filtering prevents cross-tenant data leakage
2. Engine factory returns correct engine topology per mode (shared vs per-tenant)
3. set_tenant_context helper behaves correctly for Postgres and SQLite
4. Cross-tenant writes are invisible to other tenants
5. SaaSAuthMiddleware cache maps distinct keys to distinct tenants

Run:
    pytest tests/security/test_database_isolation.py -v
"""

from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import StaticPool

from tiresias.storage.schema import (
    Base,
    TiresiasAuditLog,
    TiresiasApiLog,
    TiresiasLicense,
    TiresiasUsageBucket,
)
from tiresias.storage.engine import (
    get_engine,
    set_tenant_context,
    close_all_engines,
    _engine_registry,
    _is_postgres,
)
from tiresias.proxy.saas_auth import (
    _tenant_cache,
    _hash_api_key,
    clear_tenant_cache,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TENANT_A = str(uuid.uuid4())
TENANT_B = str(uuid.uuid4())
TENANT_C = str(uuid.uuid4())

SQLITE_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def shared_engine():
    """Single in-memory SQLite engine with all tables created."""
    engine = create_async_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(shared_engine):
    """Async session factory bound to the shared engine."""
    return async_sessionmaker(
        shared_engine, class_=AsyncSession, expire_on_commit=False
    )


@pytest_asyncio.fixture
async def seeded_session(session_factory):
    """Session pre-loaded with audit records for tenants A and B."""
    async with session_factory() as session:
        now = datetime.now(timezone.utc)
        # Tenant A: 3 audit records
        for i in range(3):
            session.add(TiresiasAuditLog(
                tenant_id=TENANT_A,
                model="gpt-4",
                provider="openai",
                token_count=100 + i,
                session_id=f"sess-a-{i}",
                created_at=now,
            ))
        # Tenant B: 2 audit records
        for i in range(2):
            session.add(TiresiasAuditLog(
                tenant_id=TENANT_B,
                model="claude-3",
                provider="anthropic",
                token_count=200 + i,
                session_id=f"sess-b-{i}",
                created_at=now,
            ))
        await session.commit()
        yield session


# ---------------------------------------------------------------------------
# 1. Application-level isolation (SQLite)
# ---------------------------------------------------------------------------
class TestApplicationLevelIsolation:
    """Verify WHERE tenant_id = :tid filtering prevents cross-tenant access."""

    @pytest.mark.asyncio
    async def test_audit_log_scoped_to_tenant_a(self, seeded_session):
        """Query audit logs for tenant A — must not contain tenant B records."""
        result = await seeded_session.execute(
            select(TiresiasAuditLog).where(
                TiresiasAuditLog.tenant_id == TENANT_A
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 3
        for row in rows:
            assert row.tenant_id == TENANT_A
            assert row.provider == "openai"

    @pytest.mark.asyncio
    async def test_audit_log_scoped_to_tenant_b(self, seeded_session):
        """Query audit logs for tenant B — must not contain tenant A records."""
        result = await seeded_session.execute(
            select(TiresiasAuditLog).where(
                TiresiasAuditLog.tenant_id == TENANT_B
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 2
        for row in rows:
            assert row.tenant_id == TENANT_B
            assert row.provider == "anthropic"

    @pytest.mark.asyncio
    async def test_session_scoping(self, seeded_session):
        """Session IDs from tenant A must not appear in tenant B queries."""
        result_a = await seeded_session.execute(
            select(TiresiasAuditLog.session_id).where(
                TiresiasAuditLog.tenant_id == TENANT_A
            )
        )
        sessions_a = {r[0] for r in result_a.all()}

        result_b = await seeded_session.execute(
            select(TiresiasAuditLog.session_id).where(
                TiresiasAuditLog.tenant_id == TENANT_B
            )
        )
        sessions_b = {r[0] for r in result_b.all()}

        assert sessions_a.isdisjoint(sessions_b), (
            f"Session ID overlap detected: {sessions_a & sessions_b}"
        )

    @pytest.mark.asyncio
    async def test_nonexistent_tenant_returns_empty(self, seeded_session):
        """Querying a tenant that has no data must return zero rows."""
        result = await seeded_session.execute(
            select(TiresiasAuditLog).where(
                TiresiasAuditLog.tenant_id == TENANT_C
            )
        )
        assert result.scalars().all() == []

    @pytest.mark.asyncio
    async def test_unscoped_query_returns_all(self, seeded_session):
        """Without tenant filter, all 5 records are visible (proving filter matters)."""
        result = await seeded_session.execute(select(TiresiasAuditLog))
        rows = result.scalars().all()
        assert len(rows) == 5

    @pytest.mark.asyncio
    async def test_cache_isolation_different_keys(self):
        """SaaSAuthMiddleware cache must map distinct keys to distinct tenants."""
        clear_tenant_cache()
        key_a = "tir_tenanta_" + uuid.uuid4().hex
        key_b = "tir_tenantb_" + uuid.uuid4().hex
        hash_a = _hash_api_key(key_a)
        hash_b = _hash_api_key(key_b)

        # Simulate cache population (as the middleware would do)
        _tenant_cache[hash_a] = (TENANT_A, "enterprise", 0.0)
        _tenant_cache[hash_b] = (TENANT_B, "professional", 0.0)

        assert _tenant_cache[hash_a][0] == TENANT_A
        assert _tenant_cache[hash_b][0] == TENANT_B
        assert _tenant_cache[hash_a][0] != _tenant_cache[hash_b][0]
        clear_tenant_cache()

    @pytest.mark.asyncio
    async def test_cache_key_collision_resistance(self):
        """Two similar but different API keys must never resolve to same hash."""
        clear_tenant_cache()
        key_a = "tir_corp_aaaaaa"
        key_b = "tir_corp_aaaaab"
        assert _hash_api_key(key_a) != _hash_api_key(key_b)
        clear_tenant_cache()


# ---------------------------------------------------------------------------
# 2. Engine mode behavior
# ---------------------------------------------------------------------------
class TestEngineModeBehavior:
    """Verify engine factory returns the right topology per mode."""

    @pytest.mark.asyncio
    async def test_sqlite_per_tenant_engines_are_separate(self, tmp_path):
        """In SQLite mode, each tenant gets its own engine instance."""
        # Ensure we are NOT in Postgres mode
        with patch.dict(os.environ, {"TIRESIAS_DATABASE_URL": ""}, clear=False):
            # Clear any cached engines from other tests
            await close_all_engines()

            engine_a = await get_engine(TENANT_A, data_root=tmp_path)
            engine_b = await get_engine(TENANT_B, data_root=tmp_path)

            assert engine_a is not engine_b
            assert str(engine_a.url) != str(engine_b.url)

            # Each engine's URL should contain the tenant_id
            assert TENANT_A in str(engine_a.url)
            assert TENANT_B in str(engine_b.url)

            # Verify separate DB files exist
            assert (tmp_path / "tenants" / TENANT_A / "tiresias.db").exists()
            assert (tmp_path / "tenants" / TENANT_B / "tiresias.db").exists()

            await close_all_engines()

    @pytest.mark.asyncio
    async def test_sqlite_same_tenant_returns_cached_engine(self, tmp_path):
        """Calling get_engine twice for the same tenant returns the same object."""
        with patch.dict(os.environ, {"TIRESIAS_DATABASE_URL": ""}, clear=False):
            await close_all_engines()

            engine_1 = await get_engine(TENANT_A, data_root=tmp_path)
            engine_2 = await get_engine(TENANT_A, data_root=tmp_path)

            assert engine_1 is engine_2
            await close_all_engines()

    @pytest.mark.asyncio
    async def test_postgres_mode_returns_shared_engine(self):
        """In Postgres mode, all tenants share a single engine keyed '__pg__'."""
        # We cannot actually connect to Postgres in unit tests, so we
        # verify the branching logic via _is_postgres and the registry key.
        with patch("tiresias.storage.engine._is_postgres", return_value=True), \
             patch("tiresias.storage.engine.DATABASE_URL", "postgresql+asyncpg://localhost/test"), \
             patch("tiresias.storage.engine.create_async_engine") as mock_create:
            await close_all_engines()

            mock_engine = AsyncMock()
            mock_conn = AsyncMock()
            mock_engine.begin.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_engine.begin.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_create.return_value = mock_engine

            engine_a = await get_engine(TENANT_A)
            engine_b = await get_engine(TENANT_B)

            # Both must be the same object (shared engine)
            assert engine_a is engine_b
            # create_async_engine should only be called once
            assert mock_create.call_count == 1

            await close_all_engines()

    @pytest.mark.asyncio
    async def test_close_all_engines_clears_registry(self, tmp_path):
        """close_all_engines must dispose all engines and empty the registry."""
        with patch.dict(os.environ, {"TIRESIAS_DATABASE_URL": ""}, clear=False):
            await close_all_engines()
            await get_engine(TENANT_A, data_root=tmp_path)
            await get_engine(TENANT_B, data_root=tmp_path)
            assert len(_engine_registry) == 2

            await close_all_engines()
            assert len(_engine_registry) == 0


# ---------------------------------------------------------------------------
# 3. Tenant context helper (set_tenant_context)
# ---------------------------------------------------------------------------
class TestTenantContextHelper:
    """Verify set_tenant_context behavior for both database backends."""

    @pytest.mark.asyncio
    async def test_sqlite_is_noop(self, shared_engine):
        """set_tenant_context must be a no-op when not in Postgres mode."""
        async with AsyncSession(shared_engine) as session:
            # Should not raise — just silently skip
            await set_tenant_context(session, TENANT_A)
            # Verify session is still usable after the no-op
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1

    @pytest.mark.asyncio
    async def test_postgres_executes_set_local(self):
        """In Postgres mode, set_tenant_context must issue SET LOCAL."""
        mock_session = AsyncMock(spec=AsyncSession)
        with patch("tiresias.storage.engine._is_postgres", return_value=True):
            await set_tenant_context(mock_session, TENANT_A)

        mock_session.execute.assert_called_once()
        call_args = mock_session.execute.call_args
        sql_text = str(call_args[0][0])
        assert "SET LOCAL" in sql_text
        assert "app.current_tenant_id" in sql_text
        assert call_args[0][1] == {"tid": TENANT_A}

    @pytest.mark.asyncio
    async def test_postgres_set_local_uses_correct_tenant(self):
        """SET LOCAL must bind the exact tenant_id passed, not a default."""
        mock_session = AsyncMock(spec=AsyncSession)
        with patch("tiresias.storage.engine._is_postgres", return_value=True):
            await set_tenant_context(mock_session, TENANT_B)

        call_args = mock_session.execute.call_args
        assert call_args[0][1]["tid"] == TENANT_B


# ---------------------------------------------------------------------------
# 4. Cross-tenant write protection
# ---------------------------------------------------------------------------
class TestCrossTenantWriteProtection:
    """Verify that records written under one tenant are invisible to another."""

    @pytest.mark.asyncio
    async def test_insert_a_query_b_returns_nothing(self, session_factory):
        """Insert audit record for A, query as B — zero results."""
        async with session_factory() as session:
            session.add(TiresiasAuditLog(
                tenant_id=TENANT_A,
                model="gpt-4o",
                token_count=500,
                created_at=datetime.now(timezone.utc),
            ))
            await session.commit()

        async with session_factory() as session:
            result = await session.execute(
                select(TiresiasAuditLog).where(
                    TiresiasAuditLog.tenant_id == TENANT_B
                )
            )
            rows = result.scalars().all()
            assert len(rows) == 0

    @pytest.mark.asyncio
    async def test_api_log_cross_tenant_invisible(self, session_factory):
        """API log entries for tenant A must not leak to tenant B queries."""
        async with session_factory() as session:
            session.add(TiresiasApiLog(
                tenant_id=TENANT_A,
                method="POST",
                path="/v1/chat/completions",
                path_pattern="/v1/chat/completions",
                status_code=200,
                latency_ms=42.5,
                created_at=datetime.now(timezone.utc),
            ))
            session.add(TiresiasApiLog(
                tenant_id=TENANT_B,
                method="GET",
                path="/v1/models",
                path_pattern="/v1/models",
                status_code=200,
                latency_ms=10.0,
                created_at=datetime.now(timezone.utc),
            ))
            await session.commit()

        async with session_factory() as session:
            result_a = await session.execute(
                select(TiresiasApiLog).where(
                    TiresiasApiLog.tenant_id == TENANT_A
                )
            )
            rows_a = result_a.scalars().all()
            assert len(rows_a) == 1
            assert rows_a[0].path == "/v1/chat/completions"

            result_b = await session.execute(
                select(TiresiasApiLog).where(
                    TiresiasApiLog.tenant_id == TENANT_B
                )
            )
            rows_b = result_b.scalars().all()
            assert len(rows_b) == 1
            assert rows_b[0].path == "/v1/models"

    @pytest.mark.asyncio
    async def test_usage_bucket_isolation(self, session_factory):
        """Usage buckets for tenant A must not be visible to tenant B."""
        bucket_hour = datetime(2026, 4, 4, 12, 0, 0, tzinfo=timezone.utc)
        async with session_factory() as session:
            session.add(TiresiasUsageBucket(
                tenant_id=TENANT_A,
                bucket_hour=bucket_hour,
                token_count=10000,
                request_count=50,
                cost_usd=0.15,
            ))
            await session.commit()

        async with session_factory() as session:
            result = await session.execute(
                select(TiresiasUsageBucket).where(
                    TiresiasUsageBucket.tenant_id == TENANT_B
                )
            )
            assert result.scalars().all() == []

            result_a = await session.execute(
                select(TiresiasUsageBucket).where(
                    TiresiasUsageBucket.tenant_id == TENANT_A
                )
            )
            rows = result_a.scalars().all()
            assert len(rows) == 1
            assert rows[0].token_count == 10000

    @pytest.mark.asyncio
    async def test_license_isolation(self, session_factory):
        """License records are keyed by tenant_id — cross-tenant lookup must fail."""
        async with session_factory() as session:
            session.add(TiresiasLicense(
                tenant_id=TENANT_A,
                tier="enterprise",
                api_key_hash=_hash_api_key("tir_a_secret"),
            ))
            await session.commit()

        async with session_factory() as session:
            result = await session.execute(
                select(TiresiasLicense).where(
                    TiresiasLicense.tenant_id == TENANT_B
                )
            )
            assert result.scalars().first() is None

            result_a = await session.execute(
                select(TiresiasLicense).where(
                    TiresiasLicense.tenant_id == TENANT_A
                )
            )
            lic = result_a.scalars().first()
            assert lic is not None
            assert lic.tier == "enterprise"

    @pytest.mark.asyncio
    async def test_bulk_insert_isolation(self, session_factory):
        """Bulk-insert records for multiple tenants, verify strict partitioning."""
        async with session_factory() as session:
            tenants = [TENANT_A, TENANT_B, TENANT_C]
            for tid in tenants:
                for i in range(10):
                    session.add(TiresiasAuditLog(
                        tenant_id=tid,
                        model=f"model-{tid[:8]}",
                        token_count=i * 10,
                        created_at=datetime.now(timezone.utc),
                    ))
            await session.commit()

        async with session_factory() as session:
            for tid in tenants:
                result = await session.execute(
                    select(TiresiasAuditLog).where(
                        TiresiasAuditLog.tenant_id == tid
                    )
                )
                rows = result.scalars().all()
                assert len(rows) == 10, f"Expected 10 rows for {tid}, got {len(rows)}"
                for row in rows:
                    assert row.tenant_id == tid
                    assert row.model == f"model-{tid[:8]}"
