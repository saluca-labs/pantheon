"""
Proxy router - catch-all route for upstream forwarding.
"""

import structlog
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from soulGate.src.database.connection import get_db
from soulGate.src.proxy.upstream import get_upstream
from soulGate.src.proxy.gateway import process_request

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["proxy"])


@router.api_route(
    "/gate/v1/proxy/{upstream_name}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_request(
    upstream_name: str,
    path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Catch-all reverse proxy route.
    Routes requests through the security pipeline to the named upstream.
    """
    upstream = get_upstream(upstream_name)
    if not upstream:
        logger.warning("proxy.upstream_not_found", upstream=upstream_name)
        return JSONResponse(
            status_code=404,
            content={"detail": f"Upstream '{upstream_name}' not found"},
        )

    if upstream.status != "active":
        logger.warning("proxy.upstream_inactive", upstream=upstream_name, status=upstream.status)
        return JSONResponse(
            status_code=503,
            content={"detail": f"Upstream '{upstream_name}' is {upstream.status}"},
        )

    return await process_request(request, upstream, path, db)
