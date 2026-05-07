"""Regression tests for v0.1.3 UUID-empty-string bug.

v0.1.2 failed in production with
  `psycopg.errors.InvalidTextRepresentation: invalid input syntax for type uuid: ""`
because `scripts/billing_aggregator.upsert_billing_period` coerced
`PeriodComputation.mssp_parent_id` from `None` to `""` at the Python layer and
relied on SQL `NULLIF(..., '') -> NULL -> CAST(NULL AS uuid)` to reach NULL.
psycopg3 parameter-type inference made that path unreliable; even rows with
a valid UUID string raised the same error.

v0.1.3 inverts the coercion: empty / whitespace / None all become real Python
`None` before binding, and the SQL drops `NULLIF(..., '')`. psycopg3 binds
`None -> SQL NULL` cleanly, and `CAST(NULL AS uuid) = NULL`.

These tests assert that property by reading the source to extract the
parameters dict constructed by `upsert_billing_period` (no DB, no psycopg,
no SQLAlchemy execution) and asserting the `mssp_parent_id` value we would
bind.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from scripts import billing_aggregator as agg


def _make_comp(mssp_parent_id):
    return SimpleNamespace(
        tenant_id="11111111-1111-4111-8111-111111111111",
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
        tier="pro",
        total_requests=0,
        tier_included_requests=1_000_000,
        overage_requests=0,
        overage_cents=0,
        base_cents=19_900,
        proration_cents=0,
        billing_route="direct",
        mssp_parent_id=mssp_parent_id,
    )


def _capture_params(comp):
    """Call upsert_billing_period with a mock conn; return the params dict bound."""
    captured = {}

    class _FakeResult:
        def fetchone(self):
            return None

    def _execute(_sql, params):
        captured.update(params)
        return _FakeResult()

    conn = MagicMock()
    conn.execute.side_effect = _execute
    agg.upsert_billing_period(conn, comp)
    return captured


def test_mssp_parent_id_empty_string_binds_as_none():
    params = _capture_params(_make_comp(""))
    assert params["mssp_parent_id"] is None


def test_mssp_parent_id_none_binds_as_none():
    params = _capture_params(_make_comp(None))
    assert params["mssp_parent_id"] is None


def test_mssp_parent_id_whitespace_binds_as_none():
    params = _capture_params(_make_comp("   "))
    assert params["mssp_parent_id"] is None


def test_mssp_parent_id_valid_uuid_is_preserved():
    uid = "ab789b06-6624-4f92-a89b-fec960991d01"
    params = _capture_params(_make_comp(uid))
    assert params["mssp_parent_id"] == uid


def test_sql_no_longer_uses_nullif_workaround():
    """The SQL must have dropped NULLIF(..., '') since Python now guarantees None."""
    import inspect
    src = inspect.getsource(agg.upsert_billing_period)
    # Strip Python comments so we only inspect the actual SQL body.
    code_lines = [ln for ln in src.splitlines() if not ln.lstrip().startswith("#")]
    code = "\n".join(code_lines)
    assert "NULLIF(" not in code, (
        "upsert_billing_period SQL still contains NULLIF(...) — the v0.1.3 "
        "fix requires the Python-side coercion to be the sole path to NULL."
    )
    assert "CAST(:mssp_parent_id AS uuid)" in code
