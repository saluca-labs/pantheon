"""BFF identity echo router.

Provides a smoke endpoint the platform-web BFF can hit to verify the
identity-header contract end-to-end. Returns the parsed identity exactly
as the BFF supplied it, plus a server-side timestamp.

This router intentionally has no other side effects so it is safe to
expose at any tier.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from platform_auth import BffIdentity, get_bff_identity

router = APIRouter(prefix="/v1/platform", tags=["Platform"])


@router.get(
    "/identity",
    summary="Echo BFF identity headers",
    description=(
        "Returns the identity claims forwarded by the platform-web BFF "
        "(X-Tiresias-User-Id / -Role / -Team-Id). Useful for end-to-end "
        "smoke tests of the BFF→API contract."
    ),
)
async def get_identity(
    identity: BffIdentity = Depends(get_bff_identity),
) -> dict:
    return {
        "identity": identity.model_dump(),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
