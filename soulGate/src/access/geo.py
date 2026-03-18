"""
Country/region allow/deny rules.
Uses ipaddress stdlib for basic geo classification.
No MaxMind DB - placeholder for future GeoIP integration.
"""

from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# Placeholder: in production, integrate MaxMind GeoLite2 or similar.
# For now, geo rules are matched against manually provided country codes
# stored in access rules.


def resolve_country(ip_address: str) -> Optional[str]:
    """
    Resolve IP address to country code.
    Placeholder implementation - returns None (unknown).
    In production, use MaxMind GeoLite2 or cloud provider IP metadata.
    """
    # Private/reserved IP ranges -> skip geo checks
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip_address)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            return None
    except ValueError:
        return None

    # TODO: integrate GeoIP database
    return None


def check_geo_rules(
    country_code: Optional[str],
    allow_countries: list[str],
    deny_countries: list[str],
) -> tuple[bool, Optional[str]]:
    """
    Check if a country code passes geo access rules.
    Returns (allowed, reason).

    Logic:
    - If deny list exists and country is in it -> denied
    - If allow list exists and country is NOT in it -> denied
    - Otherwise -> allowed
    """
    if not country_code:
        # Unknown country - allow by default (geo not resolved)
        return True, None

    country_upper = country_code.upper()

    # Check deny list first (higher priority)
    if deny_countries and country_upper in [c.upper() for c in deny_countries]:
        return False, f"Country {country_upper} is denied"

    # Check allow list (if specified, only listed countries allowed)
    if allow_countries:
        if country_upper not in [c.upper() for c in allow_countries]:
            return False, f"Country {country_upper} not in allow list"

    return True, None
