"""
Database connection management — supports both enterprise (Postgres) and local (SQLite) modes.
The rest of the app uses get_db() and doesn't need to know which backend is active.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config.settings import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all models."""
    pass


def _build_engine():
    """Build the appropriate async engine based on mode."""
    if settings.mode == "local":
        from sqlalchemy.pool import StaticPool
        return create_async_engine(
            settings.database_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.debug,
        )
    else:
        return create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            echo=settings.debug,
        )


engine = _build_engine()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Module-level reference to local database instance (set during local init)
_local_db = None


def set_local_db(local_db):
    """Set the local database instance (called during local mode startup)."""
    global _local_db, engine, async_session_factory
    _local_db = local_db
    if local_db and local_db.engine:
        engine = local_db.engine
        async_session_factory = local_db.get_session_factory()


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async database session. Works for both backends."""
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
    """Create all tables (dev/testing only)."""
    if settings.mode == "local":
        # For local mode, use aiosqlite executescript for reliable DDL
        from src.database.local import ensure_local_setup
        local_db = await ensure_local_setup(db_path=settings.local_db_path)
        set_local_db(local_db)
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose engine on shutdown."""
    global _local_db
    if _local_db:
        await _local_db.close()
        _local_db = None
    else:
        await engine.dispose()
