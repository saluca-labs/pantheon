"""BFF identity-header contract (D-06).

The platform-web BFF authenticates the user via local session cookie
and then proxies to platform-api with:

  - the shared API key as bearer/header credential
  - identity headers describing who is making the request:
      X-Tiresias-User-Id   (UUID string)
      X-Tiresias-Role      (role name; e.g. "admin", "operator", "viewer")
      X-Tiresias-Team-Id   (team scope; empty string allowed)

This module provides a FastAPI dependency that parses those headers and
enforces presence of the user-id. It is intentionally separate from
``platform_auth.dependencies.get_current_user`` (which is cookie-based),
because the BFF/API contract is API-key-with-attached-identity, not
session-cookie.

Usage:

    from fastapi import Depends, APIRouter
    from platform_auth.bff import BffIdentity, get_bff_identity

    router = APIRouter()

    @router.get("/me")
    async def me(identity: BffIdentity = Depends(get_bff_identity)) -> dict:
        return identity.model_dump()
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Header, HTTPException, status
from pydantic import BaseModel, ConfigDict


class BffIdentity(BaseModel):
    """Identity claims forwarded by the BFF."""

    model_config = ConfigDict(frozen=True)

    user_id: str
    role: str
    team_id: str = ""

    def has_role(self, *roles: str) -> bool:
        """Check whether this identity has any of the given roles, or admin."""
        return self.role == "admin" or self.role in roles


async def get_bff_identity(
    x_tiresias_user_id: Annotated[Optional[str], Header(alias="X-Tiresias-User-Id")] = None,
    x_tiresias_role: Annotated[Optional[str], Header(alias="X-Tiresias-Role")] = None,
    x_tiresias_team_id: Annotated[Optional[str], Header(alias="X-Tiresias-Team-Id")] = None,
) -> BffIdentity:
    """Extract the BFF identity from request headers.

    Raises 401 if the user-id header is missing or empty. Role defaults to
    ``"viewer"`` and team-id to the empty string when absent — the BFF
    always sends these but we want to be permissive so a misconfigured
    proxy returns ``viewer`` rather than crashing the request.
    """
    if not x_tiresias_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Tiresias-User-Id identity header",
        )

    return BffIdentity(
        user_id=x_tiresias_user_id,
        role=x_tiresias_role or "viewer",
        team_id=x_tiresias_team_id or "",
    )


def require_bff_role(*roles: str):
    """Dependency factory that requires one of the given roles (admin always allowed).

    Usage:

        @router.delete("/admin/users/{uid}")
        async def delete(
            identity: BffIdentity = Depends(require_bff_role("admin")),
        ): ...
    """
    from fastapi import Depends

    async def _check(identity: BffIdentity = Depends(get_bff_identity)) -> BffIdentity:
        if not identity.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{'|'.join(roles)}' required (got '{identity.role}')",
            )
        return identity

    return _check
