"""Tier monitoring — daily trend sampler (tech-debt #48).

Daily CronJob target (03:00 UTC). Queries key operational metrics and
emits a single structured JSON log line for monitoring trends while
the platform runs in monitor-only mode.

Metrics sampled:
  1. Count of quarantined agents (status='active' in _soulwatch_quarantines)
  2. Count of soulgate denials in last 24h (_security_audit where
     event_type contains 'denied' or outcome='denied')
  3. Count of retention policy deletions in last 24h
     (_security_audit where event_type='retention.swept')
  4. Billing aggregator last-run status (_billing_periods most recent row)

ENV:
  DATABASE_URL   Postgres DSN (sync). Falls back to SOULAUTH_DATABASE_URL_SYNC
                 then SOULAUTH_DATABASE_URL with asyncpg->psycopg rewrite.

Exit codes:
  0  success
  1  DB connection / query error
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from sqlalchemy import create_engine, text
except Exception as exc:
    print(json.dumps({
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": "ERROR",
        "msg": "trend_sampler_import_failed",
        "error": str(exc),
    }))
    sys.exit(1)


def log(level: str, msg: str, **fields: Any) -> None:
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": "tiresias-trend-sampler",
        "msg": msg,
    }
    rec.update(fields)
    print(json.dumps(rec, default=str), flush=True)


def pick_db_url() -> str:
    url = (
        os.environ.get("DATABASE_URL")
        or os.environ.get("SOULAUTH_DATABASE_URL_SYNC")
        or os.environ.get("SOULAUTH_DATABASE_URL")
    )
    if not url:
        raise RuntimeError("DATABASE_URL not set (also tried SOULAUTH_DATABASE_URL_SYNC, SOULAUTH_DATABASE_URL)")
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


def count_quarantined_agents(conn) -> int:
    """Active quarantines in _soulwatch_quarantines."""
    if not table_exists(conn, "_soulwatch_quarantines"):
        return -1
    q = text("SELECT COUNT(*) FROM _soulwatch_quarantines WHERE status = 'active'")
    return int(conn.execute(q).scalar() or 0)


def count_soulgate_denials_24h(conn) -> int:
    """Soulgate denial events in _security_audit in the last 24 hours."""
    if not table_exists(conn, "_security_audit"):
        return -1
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    q = text(
        "SELECT COUNT(*) FROM _security_audit "
        "WHERE ts >= :cutoff "
        "AND (outcome = 'denied' OR event_type ILIKE '%%denied%%' OR event_type ILIKE '%%denial%%')"
    )
    return int(conn.execute(q, {"cutoff": cutoff}).scalar() or 0)


def count_retention_deletions_24h(conn) -> int:
    """Retention sweep events in _security_audit in the last 24 hours."""
    if not table_exists(conn, "_security_audit"):
        return -1
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    q = text(
        "SELECT COUNT(*) FROM _security_audit "
        "WHERE ts >= :cutoff "
        "AND event_type = 'retention.swept'"
    )
    return int(conn.execute(q, {"cutoff": cutoff}).scalar() or 0)


def billing_aggregator_last_run(conn) -> dict:
    """Most recent billing period row: status + created_at."""
    if not table_exists(conn, "_billing_periods"):
        return {"status": "table_missing", "last_run": None}
    q = text(
        "SELECT status, created_at FROM _billing_periods "
        "ORDER BY created_at DESC LIMIT 1"
    )
    row = conn.execute(q).fetchone()
    if not row:
        return {"status": "no_rows", "last_run": None}
    return {
        "status": row[0],
        "last_run": row[1].isoformat() if row[1] else None,
    }


def main() -> int:
    log("INFO", "trend_sampler_start")

    try:
        engine = create_engine(pick_db_url(), pool_pre_ping=True, future=True)
    except Exception as exc:
        log("ERROR", "trend_sampler_connect_failed", error=str(exc))
        return 1

    try:
        with engine.connect() as conn:
            quarantined = count_quarantined_agents(conn)
            denials = count_soulgate_denials_24h(conn)
            retention_deletes = count_retention_deletions_24h(conn)
            billing = billing_aggregator_last_run(conn)
    except Exception as exc:
        log("ERROR", "trend_sampler_query_failed", error=str(exc))
        return 1

    log(
        "INFO",
        "trend_sample",
        quarantined_agents=quarantined,
        soulgate_denials_24h=denials,
        retention_deletions_24h=retention_deletes,
        billing_aggregator_status=billing["status"],
        billing_aggregator_last_run=billing["last_run"],
        sampled_at=datetime.now(timezone.utc).isoformat(),
    )

    log("INFO", "trend_sampler_complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
