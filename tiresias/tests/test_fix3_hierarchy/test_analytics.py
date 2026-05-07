"""A-1 through A-3: analytics multi-tenant tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tiresias.dashboard.analytics import (
    get_spend_summary,
    get_requests_per_day,
    get_traces,
)
from .conftest import (
    ROOT_ID, ALPHA_ID, IVORY_ID, RHO_ID,
    _make_log,
)

_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
_END   = datetime(2026, 12, 31, tzinfo=timezone.utc)
_MID   = datetime(2026, 6, 15, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_A1_single_tenant_backward_compat(db_session):
    """A-1: single-element list behaves identically to old single-tenant query."""
    log = _make_log(ALPHA_ID, cost=0.05, tokens=200, ts=_MID)
    db_session.add(log)
    await db_session.flush()

    result = await get_spend_summary(db_session, [ALPHA_ID], _START, _END)
    assert result["request_count"] >= 1
    assert result["total_cost"] >= 0.05
    # start/end are included in the response
    assert "start" in result and "end" in result


@pytest.mark.asyncio
async def test_A2_multi_tenant_aggregation(db_session):
    """A-2: multi-tenant list aggregates rows from all listed tenants."""
    log_a = _make_log(ALPHA_ID, cost=0.10, tokens=100, ts=_MID)
    log_i = _make_log(IVORY_ID, cost=0.20, tokens=200, ts=_MID)
    log_r = _make_log(RHO_ID,   cost=0.30, tokens=300, ts=_MID)
    db_session.add_all([log_a, log_i, log_r])
    await db_session.flush()

    result = await get_spend_summary(db_session, [ALPHA_ID, IVORY_ID, RHO_ID], _START, _END)
    # Should see at least our 3 rows (may have more from other tests in session)
    assert result["request_count"] >= 3
    # Cost should include all three (0.60 minimum from our inserts)
    assert result["total_cost"] >= 0.60 - 1e-6


@pytest.mark.asyncio
async def test_A2_requests_per_day_merge(db_session):
    """A-2 variant: requests_per_day merges dates across tenants."""
    ts = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)
    log_a = _make_log(ALPHA_ID, ts=ts)
    log_i = _make_log(IVORY_ID, ts=ts)
    db_session.add_all([log_a, log_i])
    await db_session.flush()

    result = await get_requests_per_day(db_session, [ALPHA_ID, IVORY_ID], _START, _END)
    counts = {entry["date"]: entry["count"] for entry in result.get("counts", [])}
    assert "2026-07-04" in counts
    assert counts["2026-07-04"] >= 2


@pytest.mark.asyncio
async def test_A3_empty_list_returns_empty(db_session):
    """A-3: empty tenant_ids list returns zero rows / zero counts."""
    result = await get_spend_summary(db_session, [], _START, _END)
    assert result["request_count"] == 0
    assert result["total_cost"] == 0.0


@pytest.mark.asyncio
async def test_A3_traces_empty_list(db_session):
    """A-3 variant for traces: empty tenant_ids returns empty items."""
    result = await get_traces(db_session, [], _START, _END)
    assert result["items"] == []
    assert result["total"] == 0


@pytest.mark.asyncio
async def test_A_isolation_no_cross_tenant_leak(db_session):
    """Isolation: query for ALPHA only must not return RESEARCH rows."""
    import uuid
    RESEARCH_ID = "00000003-0000-4000-0000-000000000001"
    log_research = _make_log(RESEARCH_ID, cost=99.99, tokens=9999, ts=_MID)
    db_session.add(log_research)
    await db_session.flush()

    result = await get_spend_summary(db_session, [ALPHA_ID], _START, _END)
    # cost 99.99 from research must NOT appear
    # We can't assert exact total (other tests add rows), but research row cost is huge
    # so if it leaked, total_cost would be >> 1.0 even accounting for test A2 rows (~0.60)
    # Safe bound: if research leaked, total would be > 100
    assert result["total_cost"] < 100.0, (
        f"Research tenant row appears to have leaked into ALPHA query: total_cost={result['total_cost']}"
    )
