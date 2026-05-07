"""Tiresias Phase D retention sweep.

Daily CronJob target. For every row in _retention_policies, computes a cutoff
timestamp (now - retention_window) and deletes rows older than cutoff in each
retention-eligible table. Chunked (LIMIT 10000 per iteration) so we never hold
a long-running transaction open.

Tables swept (only if present):
  - tiresias_audit_log       (column: created_at)
  - _soulwatch_alerts         (column: created_at, else ts)
  - aletheia_cot_events       (column: created_at, else ts)

Deliberately NOT swept: `_security_audit`. That table is append-only and
protected by INSTEAD NOTHING DELETE rules from migration 0030. SECURITY retention
is enforced by the 2-year default on retention_until and handled outside of
this sweep once the regulatory window closes.

Emits a SECURITY-level audit event `retention.swept` per tenant per run with
per-table deletion counts. Emitted as canonical JSON to stdout so it is
captured by the existing logging pipeline; the Phase B SecurityAuditHandler is
not attached here (one-shot script, no FastAPI lifespan).

ENV:
  DRY_RUN                 ("true" by default on first deploy) — counts rows
                          that WOULD be deleted but performs no DELETE.
  BATCH_LIMIT             per-iteration DELETE cap; default 10000.
  SOULAUTH_DATABASE_URL   async URL (reused if _SYNC not set).
  SOULAUTH_DATABASE_URL_SYNC  preferred sync URL (psycopg/postgresql://).

Exit codes:
  0  success (dry-run or enforced)
  1  database connection / query error
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from sqlalchemy import create_engine, text
except Exception as exc:  # pragma: no cover
    print(json.dumps({
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": "ERROR",
        "msg": "retention_sweep_import_failed",
        "error": str(exc),
    }))
    sys.exit(1)


# Mapping: retention_tier -> window (days). 'custom' resolves at row time.
TIER_DAYS: dict[str, int] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1yr": 365,
    "2yr": 730,
}

# Tables we are willing to sweep. Each entry: (table, timestamp_column_candidates).
SWEEP_TABLES: list[tuple[str, tuple[str, ...]]] = [
    ("tiresias_audit_log", ("created_at",)),
    ("_soulwatch_alerts", ("created_at", "ts")),
    ("aletheia_cot_events", ("created_at", "ts")),
]

# tenant_id column type varies across targets; we coerce per-table.
# Key: table, value: SQL snippet comparing tenant_id column against :tenant (UUID string).
TENANT_FILTER: dict[str, str] = {
    "tiresias_audit_log": "tenant_id = :tenant",
    "_soulwatch_alerts": "tenant_id::text = :tenant",
    "aletheia_cot_events": "tenant_id::text = :tenant",
}


def log(level: str, msg: str, **fields: Any) -> None:
    """Emit one canonical-JSON line to stdout."""
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": "tiresias-retention",
        "msg": msg,
    }
    rec.update(fields)
    print(json.dumps(rec, default=str), flush=True)


def pick_db_url() -> str:
    url = os.environ.get("SOULAUTH_DATABASE_URL_SYNC") or os.environ.get("SOULAUTH_DATABASE_URL")
    if not url:
        raise RuntimeError("SOULAUTH_DATABASE_URL[_SYNC] not set")
    # Normalize async DSN to sync driver if needed.
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def resolve_cutoff(now: datetime, tier: str, custom_days: int | None) -> datetime | None:
    if tier == "custom":
        if not custom_days or custom_days <= 0:
            return None
        return now - timedelta(days=custom_days)
    days = TIER_DAYS.get(tier)
    if days is None:
        return None
    return now - timedelta(days=days)


def table_exists(conn, table: str) -> bool:
    q = text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :t LIMIT 1"
    )
    return conn.execute(q, {"t": table}).scalar() is not None


def resolve_ts_column(conn, table: str, candidates: tuple[str, ...]) -> str | None:
    q = text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t"
    )
    cols = {row[0] for row in conn.execute(q, {"t": table}).fetchall()}
    for c in candidates:
        if c in cols:
            return c
    return None


def sweep_table(
    conn,
    table: str,
    ts_column: str,
    tenant: str,
    cutoff: datetime,
    dry_run: bool,
    batch_limit: int,
) -> int:
    filt = TENANT_FILTER.get(table, "tenant_id = :tenant")
    # Set tenant GUC so RLS policies tied to app.current_tenant_id admit rows.
    # Safe for non-RLS tables as well — unknown GUC is harmless.
    try:
        conn.execute(text("SELECT set_config('app.current_tenant_id', :t, false)"), {"t": tenant})
    except Exception:
        pass

    if dry_run:
        q = text(
            f"SELECT COUNT(*) FROM {table} "
            f"WHERE {filt} AND {ts_column} < :cutoff"
        )
        return int(conn.execute(q, {"tenant": tenant, "cutoff": cutoff}).scalar() or 0)

    deleted_total = 0
    while True:
        # Chunked DELETE using CTID (portable, no PK assumption).
        q = text(
            f"WITH victims AS ("
            f"  SELECT ctid FROM {table} "
            f"  WHERE {filt} AND {ts_column} < :cutoff "
            f"  LIMIT :batch"
            f") DELETE FROM {table} t USING victims v WHERE t.ctid = v.ctid"
        )
        res = conn.execute(q, {"tenant": tenant, "cutoff": cutoff, "batch": batch_limit})
        rc = res.rowcount or 0
        deleted_total += rc
        conn.commit()  # commit each chunk for resume safety
        if rc < batch_limit:
            break
    return deleted_total


def emit_retention_event(
    conn,
    tenant: str,
    counts: dict[str, int],
    cutoff: datetime,
    dry_run: bool,
) -> None:
    """Insert a SECURITY audit event into _security_audit with hash-chain continuity.

    Uses the same chain algorithm as src/tiresias/proxy/audit_handler.py:
      row_hash = sha256( prev_hash || event_type || ts || actor_id || resource_id || payload_json )
    joined by 0x1F. If _security_audit is missing, the event is still logged to stdout.
    """
    event_type = "retention.swept"
    actor_id = "system:tiresias-retention"
    resource_id = "retention.sweep"
    ts = datetime.now(timezone.utc)
    payload = {
        "tenant_id": tenant,
        "cutoff": cutoff.isoformat(),
        "dry_run": dry_run,
        "deletions": counts,
    }
    payload_json = json.dumps(payload, sort_keys=True, default=str)

    # Fetch last row_hash for tenant. Set app.current_tenant_id so RLS
    # allows reading the tenant's chain head.
    prev_hash = "genesis"
    try:
        conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tenant})
        prev = conn.execute(
            text(
                "SELECT row_hash FROM _security_audit "
                "WHERE tenant_id = CAST(:t AS uuid) ORDER BY id DESC LIMIT 1"
            ),
            {"t": tenant},
        ).scalar()
        if prev:
            prev_hash = prev
    except Exception as exc:
        log("WARNING", "retention_chain_prev_hash_failed", tenant_id=tenant, error=str(exc))

    SEP = "\x1f"
    parts = [prev_hash, event_type, ts.isoformat(), actor_id, resource_id, payload_json]
    row_hash = hashlib.sha256(SEP.join(parts).encode("utf-8")).hexdigest()

    log(
        "SECURITY",
        "retention_swept",
        event_type=event_type,
        actor_id=actor_id,
        actor_type="system",
        outcome="success",
        resource_type="retention.sweep",
        resource_id=resource_id,
        tenant_id=tenant,
        payload=payload,
        prev_hash=prev_hash,
        row_hash=row_hash,
    )

    # Persist (INSTEAD NOTHING rules on _security_audit only block UPDATE/DELETE,
    # INSERT is allowed).
    try:
        conn.execute(
            text(
                "INSERT INTO _security_audit "
                "(tenant_id, ts, event_type, actor_id, actor_type, outcome, "
                " resource_type, resource_id, service, payload, prev_hash, row_hash) "
                "VALUES (CAST(:tenant_id AS uuid), :ts, :event_type, :actor_id, 'system', 'success',"
                " 'retention.sweep', :resource_id, 'tiresias-retention',"
                " CAST(:payload AS jsonb), :prev_hash, :row_hash)"
            ),
            {
                "tenant_id": tenant,
                "ts": ts,
                "event_type": event_type,
                "actor_id": actor_id,
                "resource_id": resource_id,
                "payload": payload_json,
                "prev_hash": None if prev_hash == "genesis" else prev_hash,
                "row_hash": row_hash,
            },
        )
        conn.commit()
    except Exception as exc:
        log(
            "ERROR",
            "retention_audit_insert_failed",
            tenant_id=tenant,
            error=str(exc),
        )


def main() -> int:
    dry_run_env = os.environ.get("DRY_RUN", "true").strip().lower()
    dry_run = dry_run_env in ("1", "true", "yes", "on")
    batch_limit = int(os.environ.get("BATCH_LIMIT", "10000"))

    log(
        "INFO",
        "retention_sweep_start",
        dry_run=dry_run,
        batch_limit=batch_limit,
        started_at=datetime.now(timezone.utc).isoformat(),
    )

    try:
        engine = create_engine(pick_db_url(), pool_pre_ping=True, future=True)
    except Exception as exc:
        log("ERROR", "retention_sweep_connect_failed", error=str(exc))
        return 1

    t0 = time.time()
    total_deletions = 0
    tenants_processed = 0

    try:
        with engine.begin() as conn:
            if not table_exists(conn, "_retention_policies"):
                log("ERROR", "retention_policies_missing", msg="_retention_policies table not found; migration 0033 not applied?")
                return 1

            resolved_columns: dict[str, str | None] = {}
            for table, candidates in SWEEP_TABLES:
                if not table_exists(conn, table):
                    resolved_columns[table] = None
                    log("INFO", "retention_table_absent_skip", table=table)
                    continue
                resolved_columns[table] = resolve_ts_column(conn, table, candidates)
                if resolved_columns[table] is None:
                    log("WARNING", "retention_ts_column_not_found", table=table, candidates=list(candidates))

            # Set retention-sweeper GUC so FORCE RLS policy allows reading all rows.
            conn.execute(text("SELECT set_config('app.retention_sweeper', 'on', true)"))
            policies = conn.execute(
                text(
                    "SELECT tenant_id::text, deployment_mode, retention_tier, custom_retention_days "
                    "FROM _retention_policies"
                )
            ).fetchall()

        now = datetime.now(timezone.utc)

        for row in policies:
            tenant_id, deployment_mode, retention_tier, custom_days = row
            cutoff = resolve_cutoff(now, retention_tier, custom_days)
            if cutoff is None:
                log(
                    "WARNING",
                    "retention_cutoff_unresolvable",
                    tenant_id=tenant_id,
                    retention_tier=retention_tier,
                    custom_days=custom_days,
                )
                continue

            counts: dict[str, int] = {}
            for table, _candidates in SWEEP_TABLES:
                ts_col = resolved_columns.get(table)
                if not ts_col:
                    continue
                # Each table swept in its own short-lived transaction (chunks commit internally).
                with engine.connect() as conn:
                    try:
                        n = sweep_table(
                            conn,
                            table=table,
                            ts_column=ts_col,
                            tenant=tenant_id,
                            cutoff=cutoff,
                            dry_run=dry_run,
                            batch_limit=batch_limit,
                        )
                        counts[table] = n
                        total_deletions += n
                        verb = "would_delete" if dry_run else "deleted"
                        log(
                            "INFO",
                            f"retention_{verb}",
                            tenant_id=tenant_id,
                            table=table,
                            rows=n,
                            cutoff=cutoff.isoformat(),
                            retention_tier=retention_tier,
                        )
                    except Exception as exc:
                        log(
                            "ERROR",
                            "retention_sweep_table_failed",
                            tenant_id=tenant_id,
                            table=table,
                            error=str(exc),
                        )

            # Hash-chain audit event per tenant per run.
            with engine.connect() as conn:
                emit_retention_event(
                    conn=conn,
                    tenant=tenant_id,
                    counts=counts,
                    cutoff=cutoff,
                    dry_run=dry_run,
                )
            tenants_processed += 1

    except Exception as exc:
        log("ERROR", "retention_sweep_failed", error=str(exc))
        return 1

    duration = round(time.time() - t0, 3)
    log(
        "INFO",
        "retention_sweep_complete",
        dry_run=dry_run,
        tenants_processed=tenants_processed,
        total_rows=total_deletions,
        duration_seconds=duration,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
