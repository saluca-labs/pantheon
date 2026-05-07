"""Pydantic models for Stripe partner webhook event payloads."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConnectAccountData(BaseModel):
    """Stripe Connect account status fields from account.updated events."""
    charges_enabled: bool = False
    payouts_enabled: bool = False
    details_submitted: bool = False
    requirements: dict[str, Any] = Field(default_factory=dict)


class InvoiceData(BaseModel):
    """Core invoice fields from invoice.* events."""
    id: str = Field(..., description="Stripe Invoice ID")
    customer: str = Field(..., description="Stripe Customer ID")
    subscription: Optional[str] = None
    amount_paid: int = 0
    amount_due: int = 0
    status: str = "draft"
    currency: str = "usd"
    billing_reason: Optional[str] = None
    attempt_count: int = 0
    metadata: dict[str, str] = Field(default_factory=dict)


class TransferData(BaseModel):
    """Core transfer fields from transfer.* events."""
    id: str = Field(..., description="Stripe Transfer ID")
    amount: int = 0
    currency: str = "usd"
    destination: str = Field(..., description="Connected account ID")
    metadata: dict[str, str] = Field(default_factory=dict)


class PayoutData(BaseModel):
    """Core payout fields from payout.* events."""
    id: str = Field(..., description="Stripe Payout ID")
    amount: int = 0
    currency: str = "usd"
    status: str = "pending"
    arrival_date: Optional[int] = None
    metadata: dict[str, str] = Field(default_factory=dict)


class DisputeData(BaseModel):
    """Core dispute fields from charge.dispute.* events."""
    id: str = Field(..., description="Stripe Dispute ID")
    charge: str = Field(..., description="Stripe Charge ID")
    amount: int = 0
    currency: str = "usd"
    reason: str = "general"
    status: str = "needs_response"
    metadata: dict[str, str] = Field(default_factory=dict)


class SubscriptionData(BaseModel):
    """Core subscription fields from customer.subscription.* events."""
    id: str = Field(..., description="Stripe Subscription ID")
    customer: str = Field(..., description="Stripe Customer ID")
    status: str = "active"
    cancel_at_period_end: bool = False
    current_period_end: Optional[int] = None
    metadata: dict[str, str] = Field(default_factory=dict)


class StripeWebhookEvent(BaseModel):
    """Top-level Stripe webhook event envelope."""
    id: str = Field(..., description="Stripe Event ID (evt_xxx)")
    type: str = Field(..., description="Event type (e.g. invoice.paid)")
    data: dict[str, Any] = Field(default_factory=dict)
    created: int = Field(..., description="Unix timestamp of event creation")
    livemode: bool = False
    api_version: Optional[str] = None
    account: Optional[str] = Field(None, description="Connected account ID for Connect events")
