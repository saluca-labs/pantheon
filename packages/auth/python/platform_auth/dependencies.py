"""FastAPI dependencies for session-based auth."""

from typing import Annotated, Callable, Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncConnection

from .session import validate_session

SESSION_COOKIE = "platform_session"


async def _get_db_conn(request: Request) -> AsyncConnection:
    """Extract DB connection from app state. Apps must attach `db` to app.state."""
    return request.app.state.db


async def get_current_user(
    request: Request,
    platform_session: Annotated[Optional[str], Cookie()] = None,
    conn: AsyncConnection = Depends(_get_db_conn),
) -> dict:
    """
    FastAPI dependency that returns the current authenticated user.
    Raises 401 if not authenticated.

    Usage:
        @router.get("/me")
        async def me(user: dict = Depends(get_current_user)):
            return user
    """
    if not platform_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Cookie"},
        )

    result = await validate_session(platform_session, conn)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
            headers={"WWW-Authenticate": "Cookie"},
        )

    return result


def require_role(role: str) -> Callable:
    """
    FastAPI dependency factory that requires a specific role.

    Usage:
        @router.delete("/admin/users/{user_id}")
        async def delete_user(user=Depends(require_role("admin"))):
            ...
    """
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        user_roles: list[str] = user.get("roles", [])
        if role not in user_roles and "admin" not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' required",
            )
        return user

    return _check
