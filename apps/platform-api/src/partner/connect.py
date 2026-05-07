"""
Stripe Connect Express integration for partner onboarding and payouts.
Handles: account creation, onboarding links, status tracking, dashboard links.
"""

import os
import structlog
from typing import Optional

import httpx

logger = structlog.get_logger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"


def _stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY env var not set")
    return key


async def create_connect_account(
    partner_name: str,
    contact_email: str,
    partner_id: str,
) -> dict:
    """Create a Stripe Connect Express account for a partner."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/accounts",
            auth=(_stripe_key(), ""),
            data={
                "type": "express",
                "email": contact_email,
                "business_type": "company",
                "metadata[partner_id]": partner_id,
                "metadata[partner_name]": partner_name,
                "capabilities[card_payments][requested]": "true",
                "capabilities[transfers][requested]": "true",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        account = resp.json()

    logger.info("connect.account_created", account_id=account["id"], partner_id=partner_id)
    return {"account_id": account["id"], "status": "pending"}


async def create_onboarding_link(
    account_id: str,
    return_url: str = "https://tiresias.network/partner/onboard/complete",
    refresh_url: str = "https://tiresias.network/partner/onboard/refresh",
) -> str:
    """Generate Stripe Connect onboarding link for partner to complete KYC/tax."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/account_links",
            auth=(_stripe_key(), ""),
            data={
                "account": account_id,
                "type": "account_onboarding",
                "return_url": return_url,
                "refresh_url": refresh_url,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        link = resp.json()

    return link["url"]


async def create_dashboard_link(account_id: str) -> str:
    """Generate Express Dashboard login link for partner."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/accounts/{account_id}/login_links",
            auth=(_stripe_key(), ""),
            timeout=15.0,
        )
        resp.raise_for_status()
        link = resp.json()

    return link["url"]


async def get_account_status(account_id: str) -> dict:
    """Check Connect account onboarding status."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRIPE_API_BASE}/accounts/{account_id}",
            auth=(_stripe_key(), ""),
            timeout=15.0,
        )
        resp.raise_for_status()
        account = resp.json()

    return {
        "account_id": account["id"],
        "charges_enabled": account.get("charges_enabled", False),
        "payouts_enabled": account.get("payouts_enabled", False),
        "details_submitted": account.get("details_submitted", False),
        "requirements": account.get("requirements", {}).get("currently_due", []),
    }
