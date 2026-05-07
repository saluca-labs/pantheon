"""
Cascading commission engine for partner channel.

Revenue split logic:
- Platform (Saluca): 60% base (configurable)
- Seller (direct partner): commission_rate (default 40%)
- Recruiter (parent partner): override_commission_rate (default 10%, taken from seller's share)

For 2-party (no recruiter): 60/40 split via application_fee_percent
For 3-party (with recruiter): Separate charges + transfers
"""

import os
import uuid
import structlog
from typing import Optional
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulPartner

logger = structlog.get_logger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"

PLATFORM_BASE_RATE = 0.60  # Saluca takes 60%


def _stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY env var not set")
    return key


@dataclass
class CommissionSplit:
    """Calculated revenue split for a transaction."""
    platform_rate: float       # Saluca's share (e.g., 0.60)
    seller_rate: float         # Direct partner's share (e.g., 0.40)
    recruiter_rate: float      # Parent partner's override (e.g., 0.10, from seller's share)
    seller_account_id: Optional[str] = None
    recruiter_account_id: Optional[str] = None
    is_cascading: bool = False

    @property
    def seller_net_rate(self) -> float:
        """Seller's actual rate after recruiter override."""
        return self.seller_rate - self.recruiter_rate if self.is_cascading else self.seller_rate


async def calculate_split(
    db: AsyncSession,
    partner_id: uuid.UUID,
) -> CommissionSplit:
    """Calculate the revenue split for a partner-referred transaction."""
    result = await db.execute(select(SoulPartner).where(SoulPartner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise ValueError(f"Partner {partner_id} not found")

    seller_rate = partner.commission_rate
    platform_rate = 1.0 - seller_rate

    # Check for cascading (parent partner = recruiter)
    recruiter_rate = 0.0
    recruiter_account_id = None

    if partner.parent_partner_id:
        parent_result = await db.execute(
            select(SoulPartner).where(SoulPartner.id == partner.parent_partner_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent and parent.stripe_connect_account_id:
            recruiter_rate = partner.override_commission_rate
            recruiter_account_id = parent.stripe_connect_account_id

    return CommissionSplit(
        platform_rate=platform_rate,
        seller_rate=seller_rate,
        recruiter_rate=recruiter_rate,
        seller_account_id=partner.stripe_connect_account_id,
        recruiter_account_id=recruiter_account_id,
        is_cascading=recruiter_account_id is not None,
    )


async def execute_transfers(
    charge_id: str,
    amount_cents: int,
    split: CommissionSplit,
    transfer_group: str,
) -> list[dict]:
    """Execute transfers for a cascading commission split."""
    transfers = []

    if not split.seller_account_id:
        logger.warning("commissions.no_seller_account", transfer_group=transfer_group)
        return transfers

    seller_amount = int(amount_cents * split.seller_net_rate)
    if seller_amount > 0:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{STRIPE_API_BASE}/transfers",
                    auth=(_stripe_key(), ""),
                    data={
                        "amount": seller_amount,
                        "currency": "usd",
                        "destination": split.seller_account_id,
                        "source_transaction": charge_id,
                        "transfer_group": transfer_group,
                        "metadata[type]": "seller_commission",
                    },
                    timeout=15.0,
                )
                resp.raise_for_status()
                transfers.append({"type": "seller", "amount_cents": seller_amount, "transfer_id": resp.json()["id"]})
        except Exception as e:
            logger.error("commissions.seller_transfer_failed", error=str(e))

    if split.is_cascading and split.recruiter_account_id:
        recruiter_amount = int(amount_cents * split.recruiter_rate)
        if recruiter_amount > 0:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{STRIPE_API_BASE}/transfers",
                        auth=(_stripe_key(), ""),
                        data={
                            "amount": recruiter_amount,
                            "currency": "usd",
                            "destination": split.recruiter_account_id,
                            "source_transaction": charge_id,
                            "transfer_group": transfer_group,
                            "metadata[type]": "recruiter_override",
                        },
                        timeout=15.0,
                    )
                    resp.raise_for_status()
                    transfers.append({"type": "recruiter", "amount_cents": recruiter_amount, "transfer_id": resp.json()["id"]})
            except Exception as e:
                logger.error("commissions.recruiter_transfer_failed", error=str(e))

    logger.info(
        "commissions.transfers_executed",
        transfer_group=transfer_group,
        count=len(transfers),
        total_transferred=sum(t["amount_cents"] for t in transfers),
    )
    return transfers
