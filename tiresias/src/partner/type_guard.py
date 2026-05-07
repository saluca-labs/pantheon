import uuid
import structlog
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulPartner
from src.partner.types import PartnerType, PARTNER_CAPABILITIES

logger = structlog.get_logger(__name__)


async def _load_partner(
    request: Request,
    db: AsyncSession,
) -> SoulPartner:
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")
    try:
        tid = uuid.UUID(tenant_id_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record for this tenant")
    return partner


def require_partner_capability(capability: str):
    async def _check(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ) -> SoulPartner:
        partner = await _load_partner(request, db)
        allowed_types = PARTNER_CAPABILITIES.get(capability, set())

        if PartnerType(partner.partner_type) not in allowed_types:
            logger.warning(
                "partner.capability_denied",
                partner_id=str(partner.id),
                partner_type=partner.partner_type,
                capability=capability,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "partner_capability_denied",
                    "capability": capability,
                    "partner_type": partner.partner_type,
                },
            )

        request.state.partner = partner
        return partner

    return _check


async def get_partner_or_none(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[SoulPartner]:
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        return None
    try:
        tid = uuid.UUID(tenant_id_header)
    except ValueError:
        return None

    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    return result.scalar_one_or_none()
