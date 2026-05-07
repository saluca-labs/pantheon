"""Regression tests for v0.1.4 RLS GUC-reset bug.

v0.1.3 (and v0.1.2) failed in production with:
  `psycopg.errors.InvalidTextRepresentation: invalid input syntax for type uuid: ""`
after the FIRST tenant's INSERT succeeded. Root cause (BUILDER_TIER5_PHASE1_LOG.md):

  1. _security_audit has a single RLS policy `tenant_isolation` that CASTs
     `current_setting('app.current_tenant_id', true)` to uuid. No bypass.
  2. The aggregator's per-tenant loop opened a fresh `engine.connect()`,
     set `app.billing_aggregator='on'`, but did NOT set
     `app.current_tenant_id` at the top of the transaction.
  3. First pooled connection: GUC never registered -> current_setting returns
     NULL -> policy predicate NULL -> no error.
  4. Second iteration reuses the pooled connection where the GUC name is
     now session-registered but LOCAL-reset -> current_setting returns ''
     -> `''::uuid` throws.

v0.1.4 fix: set both `app.billing_aggregator` AND `app.current_tenant_id`
as the FIRST two statements inside each per-tenant `engine.connect()`
block, BEFORE any read or write.

These tests exercise the main loop with a mocked engine that records every
`SELECT set_config(...)` call and verifies ordering across 3 tenants.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from scripts import billing_aggregator as agg


# --- helpers ---------------------------------------------------------------


class _FakeResult:
    def __init__(self, scalar_value=None, fetchone_value=None, rowcount=0):
        self._scalar = scalar_value
        self._fetchone = fetchone_value
        self.rowcount = rowcount

    def scalar(self):
        return self._scalar

    def fetchone(self):
        return self._fetchone

    def fetchall(self):
        return []

    def commit(self):  # defensive
        return None


class _FakeConn:
    def __init__(self, recorder):
        self.recorder = recorder
        self._table_exists_map = {
            "_billing_periods": True,
            "_invoice_sync_log": True,
            "tiresias_licenses": True,
        }

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, stmt, params=None):
        sql = str(getattr(stmt, "text", stmt))
        self.recorder.append((sql, dict(params or {})))

        # table_exists probe
        if "information_schema.tables" in sql:
            return _FakeResult(scalar_value=1)

        # load_tenants probe
        if "FROM tiresias_licenses l" in sql:
            # Three tenants, all 'pro' tier, no MSSP parent.
            rows = [
                ("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "pro", None),
                ("bbbbbbbb-2222-4111-8222-bbbbbbbbbbbb", "pro", None),
                ("cccccccc-3333-4111-8333-cccccccccccc", "pro", None),
            ]
            res = _FakeResult()
            res.fetchall = lambda: rows  # type: ignore[method-assign]
            return res

        # sum_requests
        if "FROM tiresias_usage_buckets" in sql:
            return _FakeResult(scalar_value=0)

        # upsert_billing_period INSERT
        if "INSERT INTO _billing_periods" in sql:
            return _FakeResult(fetchone_value=("dead-beef-period-id",))

        # prev_hash lookup in _security_audit
        if "FROM _security_audit" in sql:
            return _FakeResult(scalar_value=None)

        # INSERT INTO _security_audit
        if "INSERT INTO _security_audit" in sql:
            return _FakeResult()

        # INSERT INTO _invoice_sync_log
        if "INSERT INTO _invoice_sync_log" in sql:
            return _FakeResult()

        # promote_window_to_ready
        if "UPDATE _billing_periods" in sql:
            return _FakeResult(rowcount=0)

        return _FakeResult()

    def commit(self):
        self.recorder.append(("__COMMIT__", {}))


class _FakeEngine:
    def __init__(self, recorder):
        self.recorder = recorder

    def begin(self):
        return _FakeConn(self.recorder)

    def connect(self):
        return _FakeConn(self.recorder)


# --- test ------------------------------------------------------------------


def test_three_tenants_all_set_both_gucs_before_any_io(monkeypatch):
    """v0.1.4 regression: each tenant must set app.billing_aggregator AND
    app.current_tenant_id BEFORE any read/write in its transaction."""
    recorder = []

    monkeypatch.setenv("DRY_RUN", "true")
    monkeypatch.setenv("SOULAUTH_DATABASE_URL_SYNC", "postgresql+psycopg://x/y")

    with patch.object(agg, "create_engine", return_value=_FakeEngine(recorder)):
        rc = agg.main()

    assert rc == 0, "aggregator main() should return 0 when no errors"

    # Find all per-tenant sum_requests calls — each one represents the first
    # real IO in its transaction. BEFORE each of those, we must see BOTH GUCs
    # set with the current tenant_id.
    tenant_ids = [
        "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        "bbbbbbbb-2222-4111-8222-bbbbbbbbbbbb",
        "cccccccc-3333-4111-8333-cccccccccccc",
    ]

    sum_request_indices = [
        i for i, (sql, _) in enumerate(recorder)
        if "FROM tiresias_usage_buckets" in sql
    ]
    assert len(sum_request_indices) == 3, (
        f"expected 3 sum_requests calls (one per tenant), got "
        f"{len(sum_request_indices)}"
    )

    for idx, tenant_id in zip(sum_request_indices, tenant_ids):
        # Walk backwards to find the two set_config calls for this
        # transaction (stop at previous sum_requests boundary).
        found_billing_aggregator = False
        found_tenant_id = False
        for j in range(idx - 1, -1, -1):
            sql, params = recorder[j]
            if "FROM tiresias_usage_buckets" in sql:
                break  # crossed previous tenant boundary
            if "set_config('app.billing_aggregator'" in sql:
                found_billing_aggregator = True
            if "set_config('app.current_tenant_id'" in sql:
                if params.get("t") == tenant_id:
                    found_tenant_id = True
        assert found_billing_aggregator, (
            f"tenant {tenant_id}: app.billing_aggregator GUC not set before IO"
        )
        assert found_tenant_id, (
            f"tenant {tenant_id}: app.current_tenant_id GUC not set with "
            f"correct tenant value before IO"
        )


def test_all_three_tenant_inserts_execute(monkeypatch):
    """Prove all 3 tenants reach the _billing_periods INSERT (not just the
    first), which was the production symptom of the v0.1.3 bug."""
    recorder = []
    monkeypatch.setenv("DRY_RUN", "true")
    monkeypatch.setenv("SOULAUTH_DATABASE_URL_SYNC", "postgresql+psycopg://x/y")

    with patch.object(agg, "create_engine", return_value=_FakeEngine(recorder)):
        rc = agg.main()
    assert rc == 0

    insert_count = sum(
        1 for sql, _ in recorder if "INSERT INTO _billing_periods" in sql
    )
    assert insert_count == 3, (
        f"expected 3 _billing_periods inserts (one per tenant); got "
        f"{insert_count}. v0.1.3 symptom was 1."
    )
