"""
CIDR-based IP allowlist/blocklist filtering.
Uses Python's ipaddress stdlib - no external deps.
"""

import ipaddress
import uuid
from typing import Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.models import SoulGateAccessRule
from soulGate.src.access.geo import resolve_country, check_geo_rules

logger = structlog.get_logger(__name__)


async def check_ip_access(
    source_ip: str,
    tenant_id: Optional[uuid.UUID],
    db: AsyncSession,
) -> tuple[bool, Optional[str]]:
    """
    Check if a source IP is allowed based on access rules.
    Returns (allowed, reason).

    Rule evaluation order (by priority):
    1. IP deny rules -> block if match
    2. IP allow rules -> if any exist, block if no match
    3. Geo deny rules -> block if match
    4. Geo allow rules -> if any exist, block if no match
    """
    if not tenant_id:
        return True, None  # No tenant context, skip access check

    try:
        addr = ipaddress.ip_address(source_ip)
    except ValueError:
        logger.warning("ip_filter.invalid_ip", ip=source_ip)
        return False, f"Invalid IP address: {source_ip}"

    # Load rules for this tenant, ordered by priority
    result = await db.execute(
        select(SoulGateAccessRule)
        .where(
            SoulGateAccessRule.tenant_id == tenant_id,
            SoulGateAccessRule.enabled == True,
        )
        .order_by(SoulGateAccessRule.priority)
    )
    rules = result.scalars().all()

    if not rules:
        return True, None  # No rules configured, allow all

    # Separate rules by type
    ip_allow = [r for r in rules if r.rule_type == "ip_allow"]
    ip_deny = [r for r in rules if r.rule_type == "ip_deny"]
    geo_allow = [r for r in rules if r.rule_type == "geo_allow"]
    geo_deny = [r for r in rules if r.rule_type == "geo_deny"]

    # 1. Check IP deny rules
    for rule in ip_deny:
        if _ip_matches_cidr(addr, rule.value):
            logger.warning("ip_filter.denied", ip=source_ip, rule_id=str(rule.id))
            return False, f"IP {source_ip} denied by rule"

    # 2. Check IP allow rules (if any exist, only listed IPs allowed)
    if ip_allow:
        allowed = any(_ip_matches_cidr(addr, rule.value) for rule in ip_allow)
        if not allowed:
            logger.warning("ip_filter.not_in_allowlist", ip=source_ip)
            return False, f"IP {source_ip} not in allowlist"

    # 3. Geo rules
    if geo_allow or geo_deny:
        country = resolve_country(source_ip)
        allow_countries = [r.value for r in geo_allow]
        deny_countries = [r.value for r in geo_deny]
        geo_allowed, geo_reason = check_geo_rules(country, allow_countries, deny_countries)
        if not geo_allowed:
            return False, geo_reason

    return True, None


def _ip_matches_cidr(addr: ipaddress.IPv4Address | ipaddress.IPv6Address, cidr: str) -> bool:
    """Check if an IP address matches a CIDR range or single IP."""
    try:
        network = ipaddress.ip_network(cidr, strict=False)
        return addr in network
    except ValueError:
        # Try as single IP
        try:
            return addr == ipaddress.ip_address(cidr)
        except ValueError:
            logger.warning("ip_filter.invalid_cidr", cidr=cidr)
            return False
