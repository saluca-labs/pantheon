"""
Database connection management for SoulGate.

Dual-backend support:
- When SOULGATE_DATABASE_URL is set to a postgresql+asyncpg:// URL,
  a shared Postgres engine is used (default behavior, shared DB with SoulAuth).
- When SOULGATE_DATABASE_URL is unset or empty, each tenant gets its own
  SQLite file at <data_root>/tenants/<tenant_id>/soulgate.db.
"""

from __future__ import annotations

import os

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from soulGate.config.settings import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for SoulGate-specific models."""
    pass


# ---------------------------------------------------------------------------
# Engine registry (shared Postgres or per-tenant SQLite)
# ---------------------------------------------------------------------------

_engine_registry: dict[str, AsyncEngine] = {}


def _is_postgres(url: str) -> bool:
    """Return True when the URL targets a PostgreSQL backend."""
    return url.startswith("postgresql")


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    """Apply SQLite-specific performance pragmas on every new connection."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA mmap_size=268435456")
    cursor.close()


def _get_engine(tenant_id: str | None = None) -> AsyncEngine:
    """
    Get or create an async engine.

    When ``settings.database_url`` points at Postgres a single shared engine
    is returned (ignoring *tenant_id*).  When it is empty/None, a per-tenant
    SQLite file is created under ``settings.data_root``.
    """
    db_url = settings.database_url

    if db_url and _is_postgres(db_url):
        # -- Postgres: shared engine --
        cache_key = "postgres_shared"
        if cache_key not in _engine_registry:
            _engine_registry[cache_key] = create_async_engine(
                db_url,
                pool_size=settings.db_pool_size,
                max_overflow=settings.db_max_overflow,
                pool_timeout=settings.db_pool_timeout,
                echo=settings.debug,
            )
        return _engine_registry[cache_key]

    # -- SQLite: per-tenant file --
    tid = tenant_id or "default"
    cache_key = f"sqlite_{tid}"
    if cache_key not in _engine_registry:
        data_root = getattr(settings, "data_root", "/data")
        tenant_dir = os.path.join(data_root, "tenants", tid)
        os.makedirs(tenant_dir, exist_ok=True)
        db_path = os.path.join(tenant_dir, "soulgate.db")
        url = f"sqlite+aiosqlite:///{db_path}"

        eng = create_async_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=settings.debug,
        )
        event.listens_for(eng.sync_engine, "connect")(_set_sqlite_pragmas)
        _engine_registry[cache_key] = eng
    return _engine_registry[cache_key]


# -- Module-level engine & session factory (used by the rest of the app) --
engine: AsyncEngine = _get_engine()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency - yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create tables on startup with retry for cloud-sql-proxy readiness.
    Uses file lock to prevent DDL deadlock with multiple uvicorn workers."""
    import asyncio
    lock_file = "/tmp/.init_db_done"
    if os.path.exists(lock_file):
        return
    # Retry loop: 60 iterations x 2s sleep = 120s total timeout, giving
    # cloud-sql-proxy enough time to establish the connection.
    for attempt in range(60):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            with open(lock_file, "w") as lf:
                lf.write("done")
            return
        except Exception:
            if attempt < 59:
                await asyncio.sleep(2)
            else:
                raise


async def close_db():
    """Dispose all engines on shutdown."""
    for eng in _engine_registry.values():
        await eng.dispose()
    _engine_registry.clear()
