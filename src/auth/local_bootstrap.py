"""
Bootstrap admin user for local auth mode.
Creates an admin user on first startup if the database is empty.
"""

import uuid

import bcrypt
import structlog
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulUser, SoulTenant
from config.settings import get_settings

logger = structlog.get_logger(__name__)


async def bootstrap_local_admin(db: AsyncSession) -> None:
    """
    Create bootstrap admin if:
    1. auth_mode includes 'local'
    2. local_admin_email and local_admin_password are set
    3. No users exist in the database yet
    """
    settings = get_settings()

    if "local" not in settings.auth_mode.split(","):
        return

    if not settings.local_admin_email or not settings.local_admin_password:
        return

    # Check if any users exist
    count = await db.execute(select(func.count()).select_from(SoulUser))
    if count.scalar() > 0:
        return  # Users already exist, skip bootstrap

    # Find a tenant to attach the admin to (prefer MSSP root, fall back to first)
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.tier == "mssp").limit(1)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        result = await db.execute(select(SoulTenant).limit(1))
        tenant = result.scalar_one_or_none()

    if not tenant:
        logger.warning("local_auth.bootstrap_skipped", reason="no_tenants")
        return

    password_hash = bcrypt.hashpw(
        settings.local_admin_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    admin = SoulUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=settings.local_admin_email,
        display_name="Administrator",
        password_hash=password_hash,
        auth_provider="local",
        admin_role="owner",
        status="active",
        idp_provider="local",
        idp_sub=settings.local_admin_email,
        last_login=datetime.now(timezone.utc),
    )
    db.add(admin)
    await db.commit()

    logger.info(
        "local_auth.bootstrap_admin_created",
        email=settings.local_admin_email,
        tenant_id=str(tenant.id),
        tenant_name=tenant.name,
    )
