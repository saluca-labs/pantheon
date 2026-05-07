"""
Async session context manager for use outside FastAPI dependency injection.

Middleware and background tasks that cannot use Depends() should import
get_async_session() and use it as an async context manager.
"""

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from src.database.connection import async_session_factory


@asynccontextmanager
async def get_async_session() -> AsyncSession:
    """Yield an AsyncSession with automatic commit/rollback/close."""
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
