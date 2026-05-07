"""
IdP Configuration CRUD router.
RBAC-gated (admin+ only). Feature-gated to sso_oidc (enterprise tier).
"""
import uuid
import structlog
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.rbac import require_permission
from src.database.connection import get_db
from src.database.models import SoulIdPConfig
from src.idp.encryption import encrypt_secret, decrypt_secret
from src.idp.schemas import IdPConfigCreate, IdPConfigResponse, IdPConfigUpdate
from src.idp.wellknown import test_idp_connection

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1/idp", tags=["Auth"])


def _get_tenant_id(request: Request) -> uuid.UUID:
    """Extract tenant_id from RBAC context or header."""
    rbac_key = getattr(request.state, "rbac_soulkey", None)
    if rbac_key:
        return rbac_key.tenant_id
    tid = request.headers.get("X-Tenant-ID")
    if tid:
        try:
            return uuid.UUID(tid)
        except ValueError:
            pass
    raise HTTPException(status_code=400, detail="Tenant ID not resolved")


@router.post("", response_model=IdPConfigResponse, dependencies=[Depends(require_permission("keys:*"))])
async def create_idp_config(
    body: IdPConfigCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new IdP config for the current tenant."""
    tenant_id = _get_tenant_id(request)
    encrypted_secret = encrypt_secret(body.client_secret)
    config = SoulIdPConfig(
        tenant_id=tenant_id,
        provider_type=body.provider_type,
        display_name=body.display_name,
        is_default=body.is_default,
        client_id=body.client_id,
        client_secret_enc=encrypted_secret,
        discovery_url=body.discovery_url,
        issuer=body.issuer,
        scopes=body.scopes,
        claim_mapping=body.claim_mapping,
        domain_hint=body.domain_hint,
        group_role_map=body.group_role_map,
        status="active",
    )
    db.add(config)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"IdP config for provider '{body.provider_type}' already exists for this tenant",
        )
    await db.refresh(config)
    logger.info("idp.created", idp_id=str(config.id), provider=config.provider_type, tenant_id=str(tenant_id))
    return IdPConfigResponse.from_orm_model(config)


@router.get("", response_model=list[IdPConfigResponse], dependencies=[Depends(require_permission("keys:read"))])
async def list_idp_configs(request: Request, db: AsyncSession = Depends(get_db)):
    """List all IdP configs for the current tenant."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(select(SoulIdPConfig).where(SoulIdPConfig.tenant_id == tenant_id))
    configs = list(result.scalars().all())
    return [IdPConfigResponse.from_orm_model(c) for c in configs]


@router.get("/{config_id}", response_model=IdPConfigResponse, dependencies=[Depends(require_permission("keys:read"))])
async def get_idp_config(config_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Get a single IdP config by ID (masks client secret)."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(SoulIdPConfig).where(SoulIdPConfig.id == config_id, SoulIdPConfig.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="IdP config not found")
    return IdPConfigResponse.from_orm_model(config)


@router.put("/{config_id}", response_model=IdPConfigResponse, dependencies=[Depends(require_permission("keys:*"))])
async def update_idp_config(
    config_id: uuid.UUID,
    body: IdPConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update an IdP config."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(SoulIdPConfig).where(SoulIdPConfig.id == config_id, SoulIdPConfig.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="IdP config not found")

    update_data = body.model_dump(exclude_none=True)
    if "client_secret" in update_data:
        config.client_secret_enc = encrypt_secret(update_data.pop("client_secret"))
    for k, v in update_data.items():
        setattr(config, k, v)

    await db.commit()
    await db.refresh(config)
    logger.info("idp.updated", idp_id=str(config.id))
    return IdPConfigResponse.from_orm_model(config)


@router.delete("/{config_id}", status_code=204, dependencies=[Depends(require_permission("keys:*"))])
async def delete_idp_config(config_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Delete an IdP config."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(SoulIdPConfig).where(SoulIdPConfig.id == config_id, SoulIdPConfig.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="IdP config not found")
    await db.delete(config)
    await db.commit()
    logger.info("idp.deleted", idp_id=str(config_id))


@router.post("/{config_id}/test", dependencies=[Depends(require_permission("keys:read"))])
async def test_idp_config(config_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Test an IdP connection by fetching its discovery document."""
    tenant_id = _get_tenant_id(request)
    result = await db.execute(
        select(SoulIdPConfig).where(SoulIdPConfig.id == config_id, SoulIdPConfig.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="IdP config not found")
    if not config.discovery_url:
        raise HTTPException(status_code=400, detail="No discovery_url configured for this IdP")
    status = await test_idp_connection(config.discovery_url, config.client_id)
    return status
