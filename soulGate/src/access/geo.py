"""
Country/region allow/deny rules.
Uses GeoLite2 database for production geo classification.

Install: pip install geoip2
Download DB: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data

Privacy: GeoIP data stored locally, no external API calls.
Compliance: Required for GDPR/geo-fencing enforcement.
"""

from typing import Optional
import os
import structlog
import geoip2.database  # pip install geoip2

logger = structlog.get_logger(__name__)

_GEOIP_READER = None


def get_geoip_reader() -> geoip2.database.Reader:
    """Lazy-load GeoIP reader with connection persistence."""
    global _GEOIP_READER
    if _GEOIP_READER is None:
        db_path = os.getenv(
            "GEOLITE2_DB_PATH",
            "/usr/share/GeoIP/GeoLite2-Country.mmdb"
        )
        if not os.path.exists(db_path):
            logger.error(f"GeoIP database not found at {db_path}")
            raise FileNotFoundError(
                f"GeoLite2 database required at {db_path}. "
                "Download from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data"
            )
        _GEOIP_READER = geoip2.database.Reader(db_path)
    return _GEOIP_READER


def resolve_country(ip_address: str) -> Optional[str]:
    """
    Resolve IP address to country code using GeoLite2.
    Returns ISO 3166-1 alpha-2 country code (e.g., 'US', 'DE', 'CN').
    Returns None for private/reserved IPs or lookup failures.

    Privacy: Local database lookup, no external requests.
    """
    import ipaddress

    try:
        addr = ipaddress.ip_address(ip_address)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            return None
    except ValueError:
        logger.warning(f"Invalid IP address: {ip_address}")
        return None

    try:
        reader = get_geoip_reader()
        response = reader.country(ip_address)
        return response.country.iso_code
    except geoip2.errors.AddressNotFoundError:
        logger.debug(f"IP not found in GeoIP database: {ip_address}")
        return None
    except Exception as e:
        logger.error(f"GeoIP lookup failed for {ip_address}: {e}")
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
