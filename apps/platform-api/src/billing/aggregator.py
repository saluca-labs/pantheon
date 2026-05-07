"""Tier 5 Phase 1 — Billing aggregator core logic (pure, testable).

The K8s CronJob entry-point is `scripts/billing_aggregator.py`; that sync
script imports the pure helpers here. Keeping the math + routing in this
module means tests (and later the Phase 2 Stripe webhook path) can reuse
them without spinning up a container.

CESO decisions (2026-04-15, final):
  * Anchor: calendar, first-of-month 00:00 UTC, period = previous calendar month
  * Overage: $0.10 per 10,000 requests over the tier-included cap
  * Routing:
      - direct  -> Tiresias own Stripe account (tenant self-signed up)
      - partner -> Stripe Connect via MSSP parent portal (has mssp_parent_id)
  * Grace: GRACE_DAYS=7 (change lives in src/billing/grace.py — Phase 2)
  * Proration: TODO Phase 2 — Phase 1 aggregator assumes no mid-period tier
    change and logs tenants with tier churn so the Phase 2 builder can
    backfill.

Authoritative tier pricing (soul memory `user:pricing_v3_reconciliation`,
cross-verified against `portal-marketing/src/app/pricing/PricingContent.tsx`
lines 46-124, as of 2026-04-15):

    community  = $0      / mo   (no bill row needed, but we still emit one
                                  for audit completeness if they generated
                                  usage)
    starter    = $49     / mo   =    4_900 cents
    pro        = $199    / mo   =   19_900 cents
    enterprise = $2,499  / mo   =  249_900 cents
    mssp       = $14,999 / mo   = 1_499_900 cents   (platform tier)
    saas/owner = internal; treated as $0 and marked 'voided' if usage zero

Included-request caps sourced from `src/usage/limits.py::TIER_LIMITS`.
Unlimited tiers (enterprise, mssp, saas, owner) produce zero overage.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional


# --- Configuration ----------------------------------------------------------

# Dollars expressed as cents (int) for Stripe compatibility and exact math.
TIER_BASE_CENTS: dict[str, int] = {
    "community": 0,
    "starter": 4_900,
    "pro": 19_900,
    "enterprise": 249_900,
    # CESO pricing v4 (2026-04-15, soul memory reference_tiresias_pricing_v4.md):
    #   mssp     = $4,999 base + $199 / child tenant
    #   platform = $14,999 base + $10 / child tenant (annual contracts)
    #   oem      = $49,999-$199,999 flat multi-year; default to low end.
    # Per-tenant scaling handled via PER_TENANT_CENTS below; base_cents here
    # is the flat portion (applied even when a tenant has zero children).
    "mssp": 499_900,
    "platform": 1_499_900,
    "oem": 4_999_900,
    "saas": 0,     # internal
    "owner": 0,    # internal
}

# Per-child-tenant upcharge added to base_cents for multi-tenant packaging.
# Count is SELECT COUNT(*) FROM _soul_tenants WHERE parent_tenant_id = <tid>.
# Tiers not listed scale at zero (flat pricing).
PER_TENANT_CENTS: dict[str, int] = {
    "mssp": 19_900,       # $199 / child tenant
    "platform": 1_000,    # $10  / child tenant
}

# Copied verbatim from src/usage/limits.py::TIER_LIMITS requests dimension.
# -1 sentinel => unlimited.
TIER_INCLUDED_REQUESTS: dict[str, int] = {
    "community": 10_000,
    "starter": 100_000,
    "pro": 1_000_000,
    "enterprise": -1,
    "mssp": -1,
    "platform": -1,
    "oem": -1,
    "saas": -1,
    "owner": -1,
}

# Overage rate: $0.10 per 10,000 requests => 10 cents per 10k block.
OVERAGE_BLOCK = 10_000
OVERAGE_CENTS_PER_BLOCK = 10

# Grace period (per CESO 2026-04-15). Aggregator does not mutate grace state
# directly; this constant is exposed so the Phase 2 webhook path + dashboard
# read one source of truth. The legacy value in src/billing/grace.py will be
# updated by the Phase 2 builder who owns Stripe webhook edits.
GRACE_DAYS = 7

BillingRoute = Literal["direct", "partner"]


@dataclass(frozen=True)
class PeriodWindow:
    """Inclusive-start, inclusive-end calendar month window (DATE)."""

    start: date
    end: date


@dataclass(frozen=True)
class PeriodComputation:
    """Result of aggregating a single tenant's previous calendar month."""

    tenant_id: str
    period_start: date
    period_end: date
    tier: str
    total_requests: int
    tier_included_requests: int
    overage_requests: int
    overage_cents: int
    base_cents: int
    proration_cents: int
    total_cents: int
    billing_route: BillingRoute
    mssp_parent_id: Optional[str]
    tenant_count: int = 0  # direct children (for mssp/platform per-tenant scaling)


# --- Pure helpers -----------------------------------------------------------


def previous_calendar_month(now: datetime) -> PeriodWindow:
    """Given an instant, return the inclusive date window for the calendar
    month immediately preceding it. 2026-04-15 -> (2026-03-01, 2026-03-31)."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    first_of_this_month = now.date().replace(day=1)
    last_of_prev_month = first_of_this_month - timedelta(days=1)
    first_of_prev_month = last_of_prev_month.replace(day=1)
    return PeriodWindow(start=first_of_prev_month, end=last_of_prev_month)


def compute_overage(total_requests: int, tier: str) -> tuple[int, int, int]:
    """Return (included_requests, overage_requests, overage_cents).

    `included_requests` is the sentinel value (may be -1 for unlimited)
    so the DB column captures what the tier promised at period start.
    """
    included = TIER_INCLUDED_REQUESTS.get(tier, TIER_INCLUDED_REQUESTS["community"])
    if included == -1 or total_requests <= included:
        return included, 0, 0
    overage = max(0, total_requests - included)
    blocks = math.ceil(overage / OVERAGE_BLOCK)
    return included, overage, blocks * OVERAGE_CENTS_PER_BLOCK


def compute_base_cents(tier: str, tenant_count: int = 0) -> int:
    """Lookup the monthly base price for a tier (cents), scaled by child count.

    For multi-tenant packages (mssp, platform) adds
    `PER_TENANT_CENTS[tier] * tenant_count` to the flat base. Flat tiers
    ignore `tenant_count`. Unknown tier -> community (free) as a safety
    fallback; the aggregator logs a warning so CESO notices mislabeled
    tenants.
    """
    flat = TIER_BASE_CENTS.get(tier, TIER_BASE_CENTS["community"])
    per_unit = PER_TENANT_CENTS.get(tier, 0)
    return flat + (per_unit * max(0, tenant_count))


def determine_billing_route(mssp_parent_id: Optional[str]) -> BillingRoute:
    """`partner` if tenant has an MSSP parent, else `direct`.

    In CESO's direct-owner model, the presence of a parent means the
    parent's Stripe Connect account handles the charge (Phase 2 wires
    this to the partner portal's existing Connect infrastructure).
    """
    return "partner" if mssp_parent_id else "direct"


def aggregate_tenant(
    *,
    tenant_id: str,
    tier: str,
    total_requests: int,
    window: PeriodWindow,
    mssp_parent_id: Optional[str] = None,
    proration_cents: int = 0,
    tenant_count: int = 0,
) -> PeriodComputation:
    """Combine the helpers into a single row ready for INSERT.

    `tenant_count` is the number of direct child tenants the caller
    counted via `_soul_tenants.parent_tenant_id`. For mssp/platform this
    drives per-child scaling; other tiers ignore it.
    """
    included, overage_requests, overage_cents = compute_overage(total_requests, tier)
    base_cents = compute_base_cents(tier, tenant_count=tenant_count)
    total_cents = base_cents + overage_cents + proration_cents
    route = determine_billing_route(mssp_parent_id)
    return PeriodComputation(
        tenant_id=tenant_id,
        period_start=window.start,
        period_end=window.end,
        tier=tier,
        total_requests=total_requests,
        tier_included_requests=included,
        overage_requests=overage_requests,
        overage_cents=overage_cents,
        base_cents=base_cents,
        proration_cents=proration_cents,
        total_cents=total_cents,
        billing_route=route,
        mssp_parent_id=mssp_parent_id,
        tenant_count=tenant_count,
    )
