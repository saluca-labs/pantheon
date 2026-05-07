"""Async SQLAlchemy engine factory for the App Proxy."""

from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine as _sa_create

from app_proxy.storage.schema import Base

logger = structlog.stdlib.get_logger("app_proxy.storage")


def create_engine(database_url: str) -> AsyncEngine:
    """Create and return an :class:`AsyncEngine` for *database_url*.

    Supports both ``sqlite+aiosqlite://`` and ``postgresql+asyncpg://``
    connection strings.
    """
    connect_args: dict = {}
    if database_url.startswith("sqlite"):
        # SQLite needs check_same_thread=False for async usage
        connect_args["check_same_thread"] = False

    engine = _sa_create(
        database_url,
        echo=False,
        future=True,
        connect_args=connect_args,
    )
    logger.info("storage.engine.created", url=database_url)
    return engine


async def create_tables(engine: AsyncEngine) -> None:
    """Create all ORM-managed tables if they do not yet exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("storage.tables.ready")
