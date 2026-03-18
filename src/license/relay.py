"""
License Relay - phone-home for non-NFR licenses.
On startup, non-NFR licenses check in with the Tiresias license server
to verify validity and refresh expiry. NFR licenses skip entirely.
Failure is non-fatal: the system operates on the grace period.
"""

import os
import time
import structlog
import httpx
from typing import Optional

from src.license.validator import LicenseToken, LicenseStatus

logger = structlog.get_logger(__name__)

LICENSE_SERVER_URL = os.environ.get(
    "TIRESIAS_LICENSE_SERVER_URL",
    "https://license.tiresias.saluca.com",
)
RELAY_TIMEOUT = 10.0  # seconds


async def check_on_startup(license_token: LicenseToken) -> LicenseToken:
    """
    Phone home for non-NFR licenses on startup.

    - NFR licenses skip relay entirely.
    - Non-NFR licenses POST to the license server /v1/relay/renew.
    - Success: update the license token's expiry.
    - Failure: log warning, continue on grace period. Non-fatal.

    Args:
        license_token: The currently validated license token.

    Returns:
        Updated LicenseToken (possibly with refreshed expiry), or the
        original token if relay was skipped or failed.
    """
    # NFR licenses never phone home
    if license_token.is_nfr:
        logger.info("license.relay_skipped", reason="nfr_license")
        return license_token

    # Only relay for valid or grace-period licenses
    if not license_token.is_valid:
        logger.debug("license.relay_skipped", reason="invalid_license")
        return license_token

    # Attempt phone-home
    try:
        renewed = await _relay_renew(license_token)
        if renewed is not None:
            return renewed
    except Exception as e:
        logger.warning(
            "license.relay_failed",
            error=str(e),
            message=(
                "License relay failed. Operating on local license. "
                "If the license is near expiry, it will enter grace period."
            ),
        )

    return license_token


async def _relay_renew(license_token: LicenseToken) -> Optional[LicenseToken]:
    """
    POST to license server to renew/verify the license.

    Returns:
        Updated LicenseToken if renewal succeeded, None if it failed.
    """
    relay_url = f"{LICENSE_SERVER_URL}/v1/relay/renew"

    payload = {
        "tenant_id": license_token.tenant_id,
        "tier": license_token.tier,
        "current_expiry": license_token.expires_at,
        "partner_id": license_token.partner_id,
        "timestamp": time.time(),
    }

    logger.info("license.relay_attempting", url=relay_url, tier=license_token.tier)

    async with httpx.AsyncClient(timeout=RELAY_TIMEOUT) as client:
        response = await client.post(relay_url, json=payload)

    if response.status_code == 200:
        data = response.json()
        new_expiry = data.get("expires_at")
        new_tier = data.get("tier", license_token.tier)

        if new_expiry and isinstance(new_expiry, (int, float)):
            logger.info(
                "license.relay_renewed",
                tier=new_tier,
                new_expiry=new_expiry,
                days_remaining=round((new_expiry - time.time()) / 86400, 1),
            )
            # Return updated token
            return LicenseToken(
                status=LicenseStatus.VALID,
                tier=new_tier,
                features=data.get("features", license_token.features),
                is_nfr=license_token.is_nfr,
                partner_id=license_token.partner_id,
                tenant_id=license_token.tenant_id,
                issued_at=license_token.issued_at,
                expires_at=new_expiry,
                raw_claims=license_token.raw_claims,
            )
        else:
            logger.warning(
                "license.relay_response_missing_expiry",
                response_data=data,
            )
            return None

    elif response.status_code == 402:
        # License server says license needs renewal/payment
        logger.warning(
            "license.relay_payment_required",
            message="License server indicates payment is required for renewal.",
        )
        return None

    elif response.status_code == 403:
        # License revoked server-side
        logger.error(
            "license.relay_revoked",
            message="License has been revoked by the license server.",
        )
        return LicenseToken(status=LicenseStatus.INVALID)

    else:
        logger.warning(
            "license.relay_unexpected_status",
            status_code=response.status_code,
            body=response.text[:200],
        )
        return None
