"""
Stripe Customer Portal session creation — BILL-01.

Requires env var: STRIPE_SECRET_KEY
Customer Portal must be configured in Stripe Dashboard before use.
"""
from __future__ import annotations
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


async def create_portal_session(
    stripe_customer_id: str,
    return_url: str = "https://tiresias.saluca.com/dashboard/settings?tab=billing",
) -> str:
    """
    Create a Stripe Customer Portal session.
    Returns the session URL. Customer is redirected here to manage billing.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/billing_portal/sessions",
            auth=(_stripe_key(), ""),
            data={
                "customer": stripe_customer_id,
                "return_url": return_url,
            },
            timeout=10.0,
        )
    resp.raise_for_status()
    data = resp.json()
    logger.info("stripe_portal_session_created", customer_id=stripe_customer_id)
    return data["url"]
