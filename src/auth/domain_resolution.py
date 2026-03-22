"""
Domain resolution — maps an email domain to an IdP config.
Used for auto-selecting the correct IdP from the user's email address.
"""

import structlog
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.oidc_provider import load_idp_config_by_domain
from src.database.models import SoulIdPConfig

logger = structlog.get_logger(__name__)


def _extract_domain(email: str) -> Optional[str]:
    """Extract the domain portion from an email address."""
    if "@" not in email:
        return None
    return email.split("@", 1)[1].lower().strip()


async def resolve_idp_by_email(
    db: AsyncSession,
    email: str,
) -> Optional[SoulIdPConfig]:
    """
    Resolve an IdP config from an email address using exact domain_hint match.
    Returns the matching SoulIdPConfig or None if no match.
    """
    domain = _extract_domain(email)
    if not domain:
        logger.warning("domain_resolution.invalid_email", email=email)
        return None

    idp_config = await load_idp_config_by_domain(db, domain)
    if idp_config:
        logger.info(
            "domain_resolution.resolved",
            domain=domain,
            provider=idp_config.provider_type,
            tenant_id=str(idp_config.tenant_id),
        )
    else:
        logger.info("domain_resolution.no_match", domain=domain)

    return idp_config


async def resolve_idp_by_domain(
    db: AsyncSession,
    domain: str,
) -> Optional[SoulIdPConfig]:
    """
    Resolve an IdP config directly from a domain string.
    Exact match on domain_hint column.
    """
    domain = domain.lower().strip()
    return await load_idp_config_by_domain(db, domain)
