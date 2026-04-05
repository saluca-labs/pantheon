"""
Bootstrap admin user for local auth mode.
Idempotent — runs on every startup to ensure the admin account is correctly
configured regardless of whether this is a fresh deploy or an upgrade.
"""

import uuid

import bcrypt
import structlog
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulUser, SoulTenant
from config.settings import get_settings

logger = structlog.get_logger(__name__)


async def bootstrap_local_admin(db: AsyncSession) -> dict:
    """
    Ensure the bootstrap admin account exists and is correctly configured.
    Runs on every startup (idempotent).

    Behaviour:
    - If the user exists: update password hash, ensure status=active,
      ensure admin_role=owner, ensure auth_provider=local.
    - If the user does not exist: create with all required columns.
    - Returns a summary dict for the startup health report.

    Requires:
    1. auth_mode includes 'local'
    2. local_admin_email and local_admin_password are set
    """
    settings = get_settings()
    result_info: dict = {"seeded": False, "email": None, "action": None, "error": None}

    if "local" not in settings.auth_mode.split(","):
        result_info["action"] = "skipped_auth_mode"
        return result_info

    if not settings.local_admin_email or not settings.local_admin_password:
        result_info["action"] = "skipped_no_credentials"
        return result_info

    result_info["email"] = settings.local_admin_email

    # Find a tenant to attach the admin to (prefer owner, then MSSP root, fall back to first)
    tenant_result = await db.execute(
        select(SoulTenant).where(SoulTenant.tier == "owner").limit(1)
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        tenant_result = await db.execute(
            select(SoulTenant).where(SoulTenant.tier == "mssp").limit(1)
        )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        tenant_result = await db.execute(select(SoulTenant).limit(1))
        tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        logger.warning("local_auth.bootstrap_skipped", reason="no_tenants")
        result_info["action"] = "skipped_no_tenants"
        return result_info

    password_hash = bcrypt.hashpw(
        settings.local_admin_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    # Check if the admin user already exists (by email + tenant)
    existing_result = await db.execute(
        select(SoulUser).where(
            SoulUser.email == settings.local_admin_email,
            SoulUser.tenant_id == tenant.id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Update existing admin to ensure correct state
        existing.password_hash = password_hash
        existing.status = "active"
        existing.admin_role = "owner"
        existing.auth_provider = "local"
        existing.idp_provider = "local"
        existing.idp_sub = settings.local_admin_email
        existing.display_name = existing.display_name or "Administrator"
        await db.commit()

        result_info["seeded"] = True
        result_info["action"] = "updated"
        logger.info(
            "local_auth.bootstrap_admin_updated",
            email=settings.local_admin_email,
            tenant_id=str(tenant.id),
            tenant_name=tenant.name,
        )
    else:
        # Create new admin user
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

        result_info["seeded"] = True
        result_info["action"] = "created"
        logger.info(
            "local_auth.bootstrap_admin_created",
            email=settings.local_admin_email,
            tenant_id=str(tenant.id),
            tenant_name=tenant.name,
        )

    return result_info
