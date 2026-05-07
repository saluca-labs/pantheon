"""Tier 5 Phase 1 — Billing aggregator CronJob entry-point.

Monthly (`0 0 1 * *`, UTC) sweep that:

  1. Computes the previous calendar month window.
  2. Loads every tenant holding an active `tiresias_licenses` row
     (authoritative "who to bill" source, per CESO 2026-04-15) +
     their `_soul_tenants.parent_tenant_id` (maps to `mssp_parent_id`).
     Retention policies are a retention concern, not a billing concern,
     and were decoupled from the aggregator on 2026-04-15.
  3. Sums `tiresias_usage_buckets.request_count` for that tenant over the
     window.
  4. Builds a `_billing_periods` row via `src.billing.aggregator` pure
     helpers and INSERTs it (idempotent — UNIQUE(tenant_id, period_start)
     makes re-runs safe).
  5. Emits a hash-chained SECURITY audit event
     `billing_period.aggregated` per tenant into `_security_audit`
     (same chain algorithm as scripts/retention_sweep.py).
  6. Transitions all rows for the window from `draft` -> `ready` iff
     every tenant processed without error.

Connection context note (2026-04-15): the previous implementation joined
from `_retention_policies`, which implicitly co-located this script with
the retention sweeper's RLS surface. The billing aggregator's own GUC
(`app.billing_aggregator = 'on'`) is the correct and sufficient context
going forward; we do NOT set `app.retention_sweeper` since billing does
not read or write retention rows.

Phase 1 does NOT talk to Stripe. `DRY_RUN=true` still writes
`_billing_periods` rows (so dashboards / tests can observe output) but
appends a `payload.would_create_stripe_invoice = true` marker to the
sync log and does NOT mark the row `ready` (stays `draft`).

ENV:
  DRY_RUN                        "true" by default; when true, writes
                                 _billing_periods rows + sync log entries
                                 tagged dry_run=true, skips ready promotion.
  SOULAUTH_DATABASE_URL[_SYNC]   Postgres DSN (async form auto-normalised).

Exit codes:
  0  success
  1  DB connection / query / aggregation error
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Optional

try:
    from sqlalchemy import create_engine, text
except Exception as exc:  # pragma: no cover
    print(json.dumps({
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": "ERROR",
        "msg": "billing_aggregator_import_failed",
        "error": str(exc),
    }))
    sys.exit(1)

# Pure helpers live in src/billing/aggregator.py so they are unit-testable
# without a DB. The script stays a thin IO wrapper.
sys.path.insert(0, "/app")  # container layout; harmless in dev
try:
    from src.billing.aggregator import (  # type: ignore
        aggregate_tenant,
        previous_calendar_month,
        PeriodComputation,
        TIER_BASE_CENTS,
        PER_TENANT_CENTS,
    )
except Exception:
    # Fallback for local `pytest tests/billing/...` runs where /app is absent.
    from billing.aggregator import (  # type: ignore
        aggregate_tenant,
        previous_calendar_month,
        PeriodComputation,
        TIER_BASE_CENTS,
        PER_TENANT_CENTS,
    )


# --- logging ---------------------------------------------------------------


def log(level: str, msg: str, **fields: Any) -> None:
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": "tiresias-billing-aggregator",
        "msg": msg,
    }
    rec.update(fields)
    print(json.dumps(rec, default=str), flush=True)


# --- db helpers ------------------------------------------------------------


def pick_db_url() -> str:
    url = os.environ.get("SOULAUTH_DATABASE_URL_SYNC") or os.environ.get("SOULAUTH_DATABASE_URL")
    if not url:
        raise RuntimeError("SOULAUTH_DATABASE_URL[_SYNC] not set")
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def table_exists(conn, table: str) -> bool:
    q = text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :t LIMIT 1"
    )
    return conn.execute(q, {"t": table}).scalar() is not None


def load_tenants(conn) -> list[dict]:
    """Return list of dicts {tenant_id, tier, parent_tenant_id}.

    Source of truth for "who to bill" is `tiresias_licenses` (CESO
    decision 2026-04-15). A license is "active" when either it has no
    expiry (perpetual internal / owner / saas / mssp rows) OR its expiry
    is in the future. `community` is excluded here because its base
    price is $0 and it generates no invoice — if a community tenant
    accumulated overage we'd still want a row, but CESO's v3.0 pricing
    reconciliation holds community at hard cap (no overage possible),
    so we skip community outright.

    Parent relationship joins from `_soul_tenants.parent_tenant_id`.
    Note `tiresias_licenses.tenant_id` is `VARCHAR` while
    `_soul_tenants.id` is `UUID`, so the join casts on the soul side.
    """
    q = text(
        """
        SELECT l.tenant_id::text             AS tenant_id,
               l.tier                        AS tier,
               st.parent_tenant_id::text     AS parent_tenant_id
        FROM tiresias_licenses l
        LEFT JOIN _soul_tenants st ON st.id::text = l.tenant_id
        WHERE (l.expiry IS NULL OR l.expiry > NOW())
          AND l.tier NOT IN ('community')
        """
    )
    rows = conn.execute(q).fetchall()
    return [
        {
            "tenant_id": r[0],
            "tier": r[1],
            "parent_tenant_id": r[2],
        }
        for r in rows
    ]


def count_child_tenants(conn, parent_tenant_id: str) -> int:
    """Count direct children in `_soul_tenants.parent_tenant_id`.

    Used for mssp/platform per-tenant scaling (CESO pricing v4, 2026-04-15).
    Relies on `app.billing_aggregator = 'on'` already set on the connection
    so the RLS bypass policy admits the SELECT.
    """
    q = text(
        """
        SELECT COUNT(*) FROM _soul_tenants
        WHERE parent_tenant_id = CAST(:pid AS uuid)
        """
    )
    try:
        return int(conn.execute(q, {"pid": parent_tenant_id}).scalar() or 0)
    except Exception as exc:
        log("WARNING", "count_child_tenants_failed",
            parent_tenant_id=parent_tenant_id, error=str(exc))
        return 0


def sum_requests(conn, tenant_id: str, start_date, end_date) -> int:
    """Sum request_count across tiresias_usage_buckets for the window.

    `bucket_hour` is a tz-aware DateTime; we compare against the UTC
    midnights of period_start and (period_end + 1 day) to cover the
    whole last day.
    """
    q = text(
        """
        SELECT COALESCE(SUM(request_count), 0) AS total
        FROM tiresias_usage_buckets
        WHERE tenant_id = :tid
          AND bucket_hour >= :start_ts
          AND bucket_hour <  :end_ts_exclusive
        """
    )
    start_ts = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_ts_exclusive = datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc)
    # end_date is INCLUSIVE (last day of month); add 1 day for exclusive upper bound.
    from datetime import timedelta as _td
    end_ts_exclusive = end_ts_exclusive + _td(days=1)
    return int(conn.execute(q, {"tid": tenant_id, "start_ts": start_ts, "end_ts_exclusive": end_ts_exclusive}).scalar() or 0)


def upsert_billing_period(conn, comp: PeriodComputation) -> Optional[str]:
    """Idempotent insert. Returns billing_period id or None if the row
    already existed (UNIQUE(tenant_id, period_start))."""
    q = text(
        """
        INSERT INTO _billing_periods (
            tenant_id, period_start, period_end, status,
            tier_at_period_start,
            total_requests, tier_included_requests,
            overage_requests, overage_cents,
            base_cents, proration_cents,
            billing_route, mssp_parent_id
        ) VALUES (
            CAST(:tenant_id AS uuid), :period_start, :period_end, 'draft',
            :tier,
            :total_requests, :tier_included_requests,
            :overage_requests, :overage_cents,
            :base_cents, :proration_cents,
            CAST(:billing_route AS billing_route_kind),
            CAST(:mssp_parent_id AS uuid)
        )
        ON CONFLICT (tenant_id, period_start) DO NOTHING
        RETURNING id::text
        """
    )
    row = conn.execute(
        q,
        {
            "tenant_id": comp.tenant_id,
            "period_start": comp.period_start,
            "period_end": comp.period_end,
            "tier": comp.tier,
            "total_requests": comp.total_requests,
            "tier_included_requests": comp.tier_included_requests,
            "overage_requests": comp.overage_requests,
            "overage_cents": comp.overage_cents,
            "base_cents": comp.base_cents,
            "proration_cents": comp.proration_cents,
            "billing_route": comp.billing_route,
            # v0.1.3 fix: coerce any falsy value (None, '', whitespace) to
            # real Python None BEFORE psycopg3 binding. psycopg3 binds None
            # as SQL NULL and CAST(NULL AS uuid) = NULL cleanly. The prior
            # '' -> NULLIF(..., '') -> CAST path tripped psycopg3 parameter
            # type inference and raised InvalidTextRepresentation on `""`
            # even for rows whose mssp_parent_id was a valid UUID string.
            "mssp_parent_id": (
                comp.mssp_parent_id.strip()
                if isinstance(comp.mssp_parent_id, str) and comp.mssp_parent_id.strip()
                else None
            ),
        },
    ).fetchone()
    return row[0] if row else None


def promote_window_to_ready(conn, start_date, end_date) -> int:
    q = text(
        """
        UPDATE _billing_periods
        SET status = 'ready', updated_at = now()
        WHERE period_start = :start AND period_end = :end AND status = 'draft'
        """
    )
    res = conn.execute(q, {"start": start_date, "end": end_date})
    return res.rowcount or 0


# --- hash-chained security audit ------------------------------------------


def emit_aggregated_event(
    conn,
    *,
    tenant_id: str,
    comp: PeriodComputation,
    billing_period_id: Optional[str],
    dry_run: bool,
) -> None:
    event_type = "billing_period.aggregated"
    actor_id = "system:tiresias-billing-aggregator"
    resource_id = billing_period_id or f"{tenant_id}:{comp.period_start.isoformat()}"
    ts = datetime.now(timezone.utc)
    payload = {
        "tenant_id": tenant_id,
        "period_start": comp.period_start.isoformat(),
        "period_end": comp.period_end.isoformat(),
        "tier": comp.tier,
        "total_requests": comp.total_requests,
        "overage_requests": comp.overage_requests,
        "overage_cents": comp.overage_cents,
        "base_cents": comp.base_cents,
        "total_cents": comp.total_cents,
        "billing_route": comp.billing_route,
        "mssp_parent_id": comp.mssp_parent_id,
        "billing_period_id": billing_period_id,
        "tenant_count": comp.tenant_count,
        "dry_run": dry_run,
        "would_create_stripe_invoice": dry_run and comp.total_cents > 0,
    }
    payload_json = json.dumps(payload, sort_keys=True, default=str)

    prev_hash = "genesis"
    try:
        conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tenant_id})
        prev = conn.execute(
            text(
                "SELECT row_hash FROM _security_audit "
                "WHERE tenant_id = CAST(:t AS uuid) ORDER BY id DESC LIMIT 1"
            ),
            {"t": tenant_id},
        ).scalar()
        if prev:
            prev_hash = prev
    except Exception as exc:
        log("WARNING", "billing_chain_prev_hash_failed", tenant_id=tenant_id, error=str(exc))

    SEP = "\x1f"
    parts = [prev_hash, event_type, ts.isoformat(), actor_id, resource_id, payload_json]
    row_hash = hashlib.sha256(SEP.join(parts).encode("utf-8")).hexdigest()

    log(
        "SECURITY",
        "billing_period_aggregated",
        event_type=event_type,
        actor_id=actor_id,
        actor_type="system",
        outcome="success",
        resource_type="billing.period",
        resource_id=resource_id,
        tenant_id=tenant_id,
        payload=payload,
        prev_hash=prev_hash,
        row_hash=row_hash,
    )

    try:
        conn.execute(
            text(
                "INSERT INTO _security_audit "
                "(tenant_id, ts, event_type, actor_id, actor_type, outcome, "
                " resource_type, resource_id, service, payload, prev_hash, row_hash) "
                "VALUES (CAST(:tenant_id AS uuid), :ts, :event_type, :actor_id, 'system', 'success',"
                " 'billing.period', :resource_id, 'tiresias-billing-aggregator',"
                " CAST(:payload AS jsonb), :prev_hash, :row_hash)"
            ),
            {
                "tenant_id": tenant_id,
                "ts": ts,
                "event_type": event_type,
                "actor_id": actor_id,
                "resource_id": resource_id,
                "payload": payload_json,
                "prev_hash": None if prev_hash == "genesis" else prev_hash,
                "row_hash": row_hash,
            },
        )
    except Exception as exc:
        log("ERROR", "billing_audit_insert_failed", tenant_id=tenant_id, error=str(exc))


def write_sync_log(
    conn,
    *,
    billing_period_id: Optional[str],
    tenant_id: str,
    action: str,
    payload: dict,
) -> None:
    if not billing_period_id:
        return  # only write when we have a foreign key
    q = text(
        """
        INSERT INTO _invoice_sync_log
            (billing_period_id, tenant_id, action, payload)
        VALUES
            (CAST(:bpid AS uuid), CAST(:tid AS uuid), :action, CAST(:payload AS jsonb))
        """
    )
    try:
        conn.execute(
            q,
            {
                "bpid": billing_period_id,
                "tid": tenant_id,
                "action": action,
                "payload": json.dumps(payload, default=str),
            },
        )
    except Exception as exc:
        log("ERROR", "sync_log_insert_failed", tenant_id=tenant_id, action=action, error=str(exc))


# --- main ------------------------------------------------------------------


def main() -> int:
    dry_run_env = os.environ.get("DRY_RUN", "true").strip().lower()
    dry_run = dry_run_env in ("1", "true", "yes", "on")

    log(
        "INFO",
        "billing_aggregator_start",
        dry_run=dry_run,
        started_at=datetime.now(timezone.utc).isoformat(),
    )

    try:
        engine = create_engine(pick_db_url(), pool_pre_ping=True, future=True)
    except Exception as exc:
        log("ERROR", "billing_aggregator_connect_failed", error=str(exc))
        return 1

    t0 = time.time()
    now = datetime.now(timezone.utc)
    window = previous_calendar_month(now)
    tenants_processed = 0
    rows_written = 0
    errors = 0
    tier_unknown_skipped = 0

    try:
        with engine.begin() as conn:
            for t in ("_billing_periods", "_invoice_sync_log", "tiresias_licenses"):
                if not table_exists(conn, t):
                    log("ERROR", "required_table_missing", table=t)
                    return 1
            # Aggregator-privileged GUC so FORCE RLS admits reads/writes.
            conn.execute(text("SELECT set_config('app.billing_aggregator', 'on', true)"))
            tenants = load_tenants(conn)

        log("INFO", "billing_aggregator_tenants_loaded", count=len(tenants),
            period_start=window.start.isoformat(), period_end=window.end.isoformat())

        for t in tenants:
            tenant_id = t["tenant_id"]
            tier = t["tier"]
            parent = t["parent_tenant_id"]

            # CESO 2026-04-15: unknown tiers are data-quality issues, not
            # billing events. Skip + log so the pricing/licensing team can
            # reconcile rather than silently billing $0.
            if tier not in TIER_BASE_CENTS:
                log(
                    "WARNING",
                    "tier_unknown_skipped",
                    tenant_id=tenant_id,
                    tier=tier,
                )
                tier_unknown_skipped += 1
                continue

            try:
                with engine.connect() as conn:
                    # v0.1.4 fix: set BOTH GUCs at the top of the per-tenant
                    # transaction. `app.billing_aggregator='on'` grants the
                    # bypass policy on _billing_periods + _invoice_sync_log.
                    # `app.current_tenant_id=<tenant>` is REQUIRED because:
                    #   1. _security_audit only has tenant_isolation policy
                    #      (no aggregator bypass); its USING clause CASTs
                    #      current_setting(..., true) to uuid and throws on
                    #      empty-string when pooled connections reuse a
                    #      session-registered but LOCAL-reset GUC.
                    #   2. Sets it BEFORE any read/write so the tenant_isolation
                    #      policy on _billing_periods also evaluates cleanly.
                    # Both are is_local=true so they reset at transaction end.
                    conn.execute(text("SELECT set_config('app.billing_aggregator', 'on', true)"))
                    conn.execute(
                        text("SELECT set_config('app.current_tenant_id', :t, true)"),
                        {"t": tenant_id},
                    )
                    total = sum_requests(conn, tenant_id, window.start, window.end)
                    # Per-tenant scaling for mssp/platform tiers (CESO v4,
                    # 2026-04-15). Other tiers pass 0 and compute_base_cents
                    # ignores it.
                    child_count = 0
                    if tier in PER_TENANT_CENTS:
                        child_count = count_child_tenants(conn, tenant_id)
                    comp = aggregate_tenant(
                        tenant_id=tenant_id,
                        tier=tier,
                        total_requests=total,
                        window=window,
                        mssp_parent_id=parent,
                        proration_cents=0,  # Phase 2 owns proration
                        tenant_count=child_count,
                    )

                    # Skip internal tiers with zero usage — no row needed.
                    if tier in ("saas", "owner") and total == 0 and comp.overage_cents == 0:
                        log("INFO", "billing_skip_internal_zero", tenant_id=tenant_id, tier=tier)
                        tenants_processed += 1
                        continue

                    bp_id = upsert_billing_period(conn, comp)
                    if bp_id:
                        rows_written += 1
                        write_sync_log(
                            conn,
                            billing_period_id=bp_id,
                            tenant_id=tenant_id,
                            action="billing_period.aggregated",
                            payload={
                                "dry_run": dry_run,
                                "would_create_stripe_invoice": dry_run and comp.total_cents > 0,
                                "total_cents": comp.total_cents,
                                "overage_cents": comp.overage_cents,
                                "billing_route": comp.billing_route,
                            },
                        )
                    else:
                        log("INFO", "billing_period_already_exists",
                            tenant_id=tenant_id, period_start=window.start.isoformat())

                    emit_aggregated_event(
                        conn,
                        tenant_id=tenant_id,
                        comp=comp,
                        billing_period_id=bp_id,
                        dry_run=dry_run,
                    )
                    conn.commit()
                tenants_processed += 1
            except Exception as exc:
                errors += 1
                log("ERROR", "billing_aggregator_tenant_failed",
                    tenant_id=tenant_id, error=str(exc))

        # Promote window to ready only if no errors and not a dry run.
        if errors == 0 and not dry_run:
            with engine.begin() as conn:
                conn.execute(text("SELECT set_config('app.billing_aggregator', 'on', true)"))
                promoted = promote_window_to_ready(conn, window.start, window.end)
            log("INFO", "billing_period_window_ready", promoted=promoted)

    except Exception as exc:
        log("ERROR", "billing_aggregator_failed", error=str(exc))
        return 1

    duration = round(time.time() - t0, 3)
    log(
        "INFO",
        "billing_aggregator_complete",
        dry_run=dry_run,
        tenants_processed=tenants_processed,
        rows_written=rows_written,
        errors=errors,
        tier_unknown_skipped=tier_unknown_skipped,
        duration_seconds=duration,
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
