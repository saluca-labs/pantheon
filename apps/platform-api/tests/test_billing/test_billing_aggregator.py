"""Unit tests for src/billing/aggregator.py (Tier 5 Phase 1).

Covers: overage math at threshold edges, base pricing lookup, route
determination (direct vs partner), previous-calendar-month window, and
end-to-end aggregate_tenant composition.

These tests are pure — no DB, no network. Idempotency of the DB INSERT
is enforced by the UNIQUE(tenant_id, period_start) constraint in
migration 0034 and validated in the integration smoke test separately.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from src.billing.aggregator import (
    OVERAGE_BLOCK,
    OVERAGE_CENTS_PER_BLOCK,
    PER_TENANT_CENTS,
    TIER_BASE_CENTS,
    TIER_INCLUDED_REQUESTS,
    aggregate_tenant,
    compute_base_cents,
    compute_overage,
    determine_billing_route,
    previous_calendar_month,
)


# --- previous_calendar_month ----------------------------------------------


@pytest.mark.parametrize(
    "now,expected_start,expected_end",
    [
        (datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc), date(2026, 3, 1), date(2026, 3, 31)),
        (datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc), date(2025, 12, 1), date(2025, 12, 31)),
        # Leap-year February boundary (2024-02 has 29 days).
        (datetime(2024, 3, 2, 3, 30, tzinfo=timezone.utc), date(2024, 2, 1), date(2024, 2, 29)),
        # Naive datetime gets coerced to UTC.
        (datetime(2026, 5, 1, 0, 0, 1), date(2026, 4, 1), date(2026, 4, 30)),
    ],
)
def test_previous_calendar_month(now, expected_start, expected_end):
    w = previous_calendar_month(now)
    assert w.start == expected_start
    assert w.end == expected_end


# --- compute_overage -------------------------------------------------------


def test_overage_zero_when_under_cap():
    included, overage, cents = compute_overage(100, "starter")
    assert included == 100_000
    assert overage == 0
    assert cents == 0


def test_overage_zero_at_exact_cap():
    included, overage, cents = compute_overage(100_000, "starter")
    assert overage == 0
    assert cents == 0


def test_overage_one_request_over_cap_charges_one_block():
    # 1 request over the cap still rounds up to a full 10k block at 10 cents.
    _, overage, cents = compute_overage(100_001, "starter")
    assert overage == 1
    assert cents == OVERAGE_CENTS_PER_BLOCK  # 10 cents


def test_overage_exact_block_boundary():
    # 10_000 over the cap => exactly 1 block.
    _, overage, cents = compute_overage(110_000, "starter")
    assert overage == 10_000
    assert cents == 10


def test_overage_block_plus_one():
    # 10_001 over => 2 blocks.
    _, overage, cents = compute_overage(110_001, "starter")
    assert overage == 10_001
    assert cents == 20


def test_overage_large_volume():
    # 1,000,000 over the pro cap => 100 blocks => $10.00.
    _, overage, cents = compute_overage(2_000_000, "pro")
    assert overage == 1_000_000
    assert cents == 1_000  # 100 blocks * 10 cents


@pytest.mark.parametrize("tier", ["enterprise", "mssp", "platform", "oem", "saas", "owner"])
def test_overage_unlimited_tiers_never_charge(tier):
    included, overage, cents = compute_overage(10_000_000_000, tier)
    assert included == -1
    assert overage == 0
    assert cents == 0


def test_overage_community_tier():
    _, overage, cents = compute_overage(20_000, "community")
    assert overage == 10_000  # 20k - 10k cap
    assert cents == 10


# --- compute_base_cents ----------------------------------------------------


def test_tier_base_prices_from_v4_reconciliation():
    # CESO pricing v4 (2026-04-15, soul:reference_tiresias_pricing_v4.md).
    # Multi-tenant packages reflect the FLAT portion of base; per-tenant
    # scaling is applied via the tenant_count argument.
    assert compute_base_cents("community") == 0
    assert compute_base_cents("starter") == 4_900
    assert compute_base_cents("pro") == 19_900
    assert compute_base_cents("enterprise") == 249_900
    assert compute_base_cents("mssp") == 499_900       # was $14,999 in v3
    assert compute_base_cents("platform") == 1_499_900  # new tier in v4
    assert compute_base_cents("oem") == 4_999_900       # low-end default


def test_unknown_tier_falls_back_to_free():
    assert compute_base_cents("bogus") == 0


# --- v4 per-tenant scaling ------------------------------------------------


def test_mssp_base_zero_children():
    assert compute_base_cents("mssp", tenant_count=0) == 499_900


def test_mssp_base_ten_children():
    # $4,999 + (10 x $199) = $6,989 = 698_900 cents
    assert compute_base_cents("mssp", tenant_count=10) == 499_900 + (10 * 19_900)
    assert compute_base_cents("mssp", tenant_count=10) == 698_900


def test_platform_base_fifty_tenants():
    # $14,999 + (50 x $10) = $15,499 = 1_549_900 cents
    assert compute_base_cents("platform", tenant_count=50) == 1_499_900 + (50 * 1_000)
    assert compute_base_cents("platform", tenant_count=50) == 1_549_900


def test_oem_default_flat_ignores_tenant_count():
    assert compute_base_cents("oem", tenant_count=0) == 4_999_900
    # OEM has no PER_TENANT_CENTS entry -> scaling is zero.
    assert compute_base_cents("oem", tenant_count=100) == 4_999_900


def test_flat_tiers_ignore_tenant_count():
    for tier in ("starter", "pro", "enterprise"):
        flat = compute_base_cents(tier)
        assert compute_base_cents(tier, tenant_count=25) == flat


def test_per_tenant_rates():
    assert PER_TENANT_CENTS["mssp"] == 19_900   # $199
    assert PER_TENANT_CENTS["platform"] == 1_000  # $10
    assert "oem" not in PER_TENANT_CENTS
    assert "enterprise" not in PER_TENANT_CENTS


# --- determine_billing_route ----------------------------------------------


def test_route_direct_when_no_parent():
    assert determine_billing_route(None) == "direct"


def test_route_partner_when_parent_present():
    assert determine_billing_route("00000000-0000-0000-0000-000000000001") == "partner"


# --- aggregate_tenant end-to-end ------------------------------------------


def test_aggregate_direct_sold_pro_with_overage():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="11111111-1111-1111-1111-111111111111",
        tier="pro",
        total_requests=1_050_000,
        window=window,
    )
    assert comp.billing_route == "direct"
    assert comp.mssp_parent_id is None
    assert comp.base_cents == 19_900
    assert comp.overage_requests == 50_000
    assert comp.overage_cents == 50  # 5 blocks * 10
    assert comp.total_cents == 19_900 + 50


def test_aggregate_partner_sold_starter_under_cap():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="22222222-2222-2222-2222-222222222222",
        tier="starter",
        total_requests=50_000,
        window=window,
        mssp_parent_id="99999999-9999-9999-9999-999999999999",
    )
    assert comp.billing_route == "partner"
    assert comp.mssp_parent_id == "99999999-9999-9999-9999-999999999999"
    assert comp.overage_cents == 0
    assert comp.total_cents == 4_900


def test_aggregate_mssp_tenant_never_overages():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="33333333-3333-3333-3333-333333333333",
        tier="mssp",
        total_requests=10_000_000,
        window=window,
    )
    assert comp.tier_included_requests == -1
    assert comp.overage_cents == 0
    # v4: MSSP with no children = $4,999 flat base (was $14,999 in v3).
    assert comp.total_cents == 499_900
    assert comp.tenant_count == 0


def test_aggregate_mssp_ten_children():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="33333333-3333-3333-3333-333333333333",
        tier="mssp",
        total_requests=0,
        window=window,
        tenant_count=10,
    )
    assert comp.base_cents == 499_900 + (10 * 19_900)  # 698_900
    assert comp.total_cents == 698_900
    assert comp.tenant_count == 10


def test_aggregate_platform_fifty_children():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="55555555-5555-5555-5555-555555555555",
        tier="platform",
        total_requests=0,
        window=window,
        tenant_count=50,
    )
    assert comp.base_cents == 1_499_900 + (50 * 1_000)  # 1_549_900
    assert comp.total_cents == 1_549_900


def test_aggregate_oem_default():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="66666666-6666-6666-6666-666666666666",
        tier="oem",
        total_requests=0,
        window=window,
    )
    assert comp.base_cents == 4_999_900
    assert comp.total_cents == 4_999_900


def test_aggregate_flat_tiers_unchanged_under_v4():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    for tier, expected in (("starter", 4_900), ("pro", 19_900), ("enterprise", 249_900)):
        comp = aggregate_tenant(
            tenant_id="77777777-7777-7777-7777-777777777777",
            tier=tier,
            total_requests=0,
            window=window,
        )
        assert comp.base_cents == expected
        assert comp.total_cents == expected


def test_proration_cents_flows_through_total():
    from src.billing.aggregator import PeriodWindow

    window = PeriodWindow(date(2026, 3, 1), date(2026, 3, 31))
    comp = aggregate_tenant(
        tenant_id="44444444-4444-4444-4444-444444444444",
        tier="pro",
        total_requests=0,
        window=window,
        proration_cents=-500,  # refund credit
    )
    assert comp.total_cents == 19_900 - 500


# --- constants sanity -----------------------------------------------------


def test_overage_constants_match_spec():
    assert OVERAGE_BLOCK == 10_000
    assert OVERAGE_CENTS_PER_BLOCK == 10  # $0.10 per 10k


def test_tier_tables_cover_all_limits_tiers():
    # If `src/usage/limits.py` adds a new tier, both tables here must learn it.
    from src.usage.limits import TIER_LIMITS  # type: ignore

    for tier in TIER_LIMITS:
        assert tier in TIER_BASE_CENTS, f"missing base price for tier {tier}"
        assert tier in TIER_INCLUDED_REQUESTS, f"missing included requests for tier {tier}"
