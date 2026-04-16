"""
Test fixtures for Fix #3 — tenant hierarchy + analytics multi-tenant tests.
Uses SQLite in-memory; no Postgres, no network.
"""
from __future__ import annotations

import asyncio
import os

os.environ.setdefault("TIRESIAS_MODE", "onprem")
os.environ.setdefault("TIRESIAS_TENANT_ID", "ab789b06-6624-4f92-a89b-fec960991d01")
os.environ.setdefault("ENVIRONMENT", "test")

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tiresias.storage.schema import Base, TiresiasAuditLog

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Tenant hierarchy used across tests
ROOT_ID = "ab789b06-6624-4f92-a89b-fec960991d01"
ALPHA_ID = "00000003-0000-4000-a001-000000000001"
IVORY_ID = "00000003-0000-4000-a002-000000000001"
RHO_ID   = "00000003-0000-4000-a005-000000000001"
RESEARCH_ROOT_ID = "00000003-0000-4000-0000-000000000001"
XI_ID    = "00000003-0000-4000-a003-000000000001"
SIGMA_ID = "00000003-0000-4000-a004-000000000001"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Create _soul_tenants table (not in Tiresias ORM, but needed for CTE)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS _soul_tenants (
                id TEXT PRIMARY KEY,
                parent_tenant_id TEXT,
                slug TEXT,
                status TEXT DEFAULT 'active'
            )
        """))
        # Seed tenant hierarchy
        tenants = [
            (ROOT_ID,         None,           "saluca",               "active"),
            (ALPHA_ID,        ROOT_ID,        "saluca-alpha",         "active"),
            (IVORY_ID,        ROOT_ID,        "saluca-ivory",         "active"),
            (RHO_ID,          ROOT_ID,        "saluca-rho",           "active"),
            (RESEARCH_ROOT_ID, None,          "saluca-research",      "active"),
            (XI_ID,           RESEARCH_ROOT_ID, "saluca-research-xi", "active"),
            (SIGMA_ID,        RESEARCH_ROOT_ID, "saluca-research-sigma", "active"),
        ]
        for tid, parent, slug, status in tenants:
            await conn.execute(text(
                "INSERT OR IGNORE INTO _soul_tenants (id, parent_tenant_id, slug, status) "
                "VALUES (:id, :parent, :slug, :status)"
            ), {"id": tid, "parent": parent, "slug": slug, "status": status})
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


def _make_log(tenant_id: str, cost: float = 0.001, provider: str = "openai",
              model: str = "gpt-4o", tokens: int = 100, session_id: str | None = None,
              ts: datetime | None = None) -> TiresiasAuditLog:
    return TiresiasAuditLog(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        cost_usd=cost,
        provider=provider,
        model=model,
        token_count=tokens,
        prompt_tokens=tokens // 2,
        completion_tokens=tokens // 2,
        session_id=session_id or str(uuid.uuid4()),
        created_at=ts or datetime.now(timezone.utc),
        deleted_at=None,
    )
