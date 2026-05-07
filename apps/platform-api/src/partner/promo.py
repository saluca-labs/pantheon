"""
Partner-specific Stripe promotion code management.
Creates coupons and promo codes with partner attribution metadata.
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


async def create_partner_coupon(
    partner_id: str,
    discount_percent: float,
    duration: str = "repeating",
    duration_months: int = 12,
    product_ids: Optional[list[str]] = None,
    name: Optional[str] = None,
) -> dict:
    """Create a Stripe coupon for a partner's customers."""
    data = {
        "percent_off": discount_percent,
        "duration": duration,
        "metadata[partner_id]": partner_id,
        "metadata[type]": "partner_discount",
    }
    if duration == "repeating" and duration_months:
        data["duration_in_months"] = str(duration_months)
    if name:
        data["name"] = name
    if product_ids:
        for i, pid in enumerate(product_ids):
            data[f"applies_to[products][{i}]"] = pid

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/coupons",
            auth=(_stripe_key(), ""),
            data=data,
            timeout=15.0,
        )
        resp.raise_for_status()
        coupon = resp.json()

    logger.info("promo.coupon_created", coupon_id=coupon["id"], partner_id=partner_id)
    return {"coupon_id": coupon["id"], "percent_off": discount_percent}


async def create_promo_code(
    coupon_id: str,
    code: str,
    partner_id: str,
    connect_account_id: Optional[str] = None,
    max_redemptions: Optional[int] = None,
) -> dict:
    """Create a partner-specific promotion code linked to a coupon."""
    data = {
        "coupon": coupon_id,
        "code": code.upper(),
        "metadata[partner_id]": partner_id,
        "metadata[type]": "partner_referral",
    }
    if connect_account_id:
        data["metadata[connect_account]"] = connect_account_id
    if max_redemptions:
        data["max_redemptions"] = str(max_redemptions)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STRIPE_API_BASE}/promotion_codes",
            auth=(_stripe_key(), ""),
            data=data,
            timeout=15.0,
        )
        resp.raise_for_status()
        promo = resp.json()

    logger.info("promo.code_created", code=code.upper(), coupon_id=coupon_id, partner_id=partner_id)
    return {"promo_code_id": promo["id"], "code": promo["code"]}


async def list_partner_promo_codes(partner_id: str) -> list[dict]:
    """List all promotion codes for a partner."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRIPE_API_BASE}/promotion_codes",
            auth=(_stripe_key(), ""),
            params={"limit": 100},
            timeout=15.0,
        )
        resp.raise_for_status()
        all_codes = resp.json().get("data", [])

    return [
        {
            "promo_code_id": pc["id"],
            "code": pc["code"],
            "coupon_id": pc["coupon"]["id"] if isinstance(pc.get("coupon"), dict) else pc.get("coupon"),
            "percent_off": pc.get("coupon", {}).get("percent_off") if isinstance(pc.get("coupon"), dict) else None,
            "active": pc["active"],
            "times_redeemed": pc["times_redeemed"],
            "max_redemptions": pc.get("max_redemptions"),
        }
        for pc in all_codes
        if pc.get("metadata", {}).get("partner_id") == partner_id
    ]
