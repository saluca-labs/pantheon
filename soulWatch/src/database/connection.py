"""
Database connection management for SoulWatch.
Shares the same Postgres database as SoulAuth but manages its own tables.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from soulWatch.config.settings import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for SoulWatch-specific models."""
    pass


engine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    echo=settings.debug,
    connect_args={"timeout": 10, "ssl": False},
)

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
    import os
    lock_file = "/tmp/.init_db_done"
    if os.path.exists(lock_file):
        return
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
    """Dispose engine on shutdown."""
    await engine.dispose()
