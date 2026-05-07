"""Billing API Pydantic schemas — BILL-01, BILL-02, BILL-04."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PortalSessionResponse(BaseModel):
    url: str = Field(..., description="Stripe Customer Portal session URL. Redirect customer here.")


class UpgradeRequest(BaseModel):
    new_tier: str = Field(..., description="Target tier: starter, pro, enterprise, mssp, saas")
    stripe_price_id: Optional[str] = Field(None, description="Stripe price ID for the new tier")


class UpgradeResponse(BaseModel):
    tenant_id: str
    old_tier: str
    new_tier: str
    stripe_subscription_id: Optional[str]
    status: str


class GracePeriodStatus(BaseModel):
    tenant_id: str
    payment_failed_at: Optional[datetime]
    grace_deadline: Optional[datetime]
    days_remaining: Optional[int]
    status: str  # active | payment_failed | downgraded
