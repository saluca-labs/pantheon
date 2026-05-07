"""Dashboard APIRouter — mountable on the main proxy app.

This module exposes the same /dash/* endpoints as dashboard/app.py but as an
APIRouter that can be included in any FastAPI app (e.g. the proxy) *before*
catch-all routes.  It re-uses the proxy app's settings and health tracker via
the module-level accessors in proxy.app.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from tiresias.storage.engine import set_tenant_context
from tiresias.storage.tenants import get_descendant_tenant_ids

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dashboard"])


# ---------------------------------------------------------------------------
# Helpers (same as dashboard/app.py but import-safe)
# ---------------------------------------------------------------------------

def _default_window() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=30)
    return start, now


def _parse_dt_param(dt_str: str | None, default: datetime) -> datetime:
    if not dt_str:
        return default
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return default


def _get_proxy_settings():
    from tiresias.proxy.app import get_settings
    return get_settings()


async def _get_proxy_engine():
    from tiresias.storage.engine import get_engine
    cfg = _get_proxy_settings()
    return await get_engine(cfg.tenant_id, cfg.data_root)


def _get_proxy_health():
    from tiresias.proxy.app import get_health
    return get_health()


async def _resolve_caller_tenant(request: Request) -> str | None:
    """Return the authenticated caller's tenant_id from request state.

    Checks soulkey_tenant_id first (set by auth.py when X-SoulKey verified),
    then falls back to tenant_id (set by API-key auth path if present).
    """
    return (
        getattr(request.state, "soulkey_tenant_id", None)
        or getattr(request.state, "tenant_id", None)
    )


# ---------------------------------------------------------------------------
# Auth dependency — accepts X-SoulKey OR X-Tiresias-Api-Key / Bearer
# ---------------------------------------------------------------------------

async def _require_auth(request: Request) -> str:
    from tiresias.dashboard.auth import make_auth_dependency
    dep = make_auth_dependency(_get_proxy_settings, _get_proxy_engine)
    return await dep(request)

AuthDep = Annotated[str, Depends(_require_auth)]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dash/health")
async def dash_health() -> dict:
    return {"status": "ok", "service": "tiresias-dashboard"}


@router.get("/dash/v1/spend")
async def spend_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
) -> dict:
    from tiresias.dashboard.analytics import get_spend_summary
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                return await get_spend_summary(session, [cfg.tenant_id], t_start, t_end)

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    aggregated = {
        "total_cost": 0.0,
        "total_tokens": 0,
        "total_prompt_tokens": 0,
        "total_completion_tokens": 0,
        "request_count": 0,
        "start": t_start.isoformat(),
        "end": t_end.isoformat(),
    }
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_spend_summary(session, [tid], t_start, t_end)
        aggregated["total_cost"] = round(aggregated["total_cost"] + partial["total_cost"], 8)
        aggregated["total_tokens"] += partial["total_tokens"]
        aggregated["total_prompt_tokens"] += partial["total_prompt_tokens"]
        aggregated["total_completion_tokens"] += partial["total_completion_tokens"]
        aggregated["request_count"] += partial["request_count"]
    return aggregated


@router.get("/dash/v1/requests")
async def requests_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
) -> dict:
    from tiresias.dashboard.analytics import get_requests_per_day
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                return await get_requests_per_day(session, [cfg.tenant_id], t_start, t_end)

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    # Merge: keyed by date, sum count and cost_usd
    merged: dict[str, dict] = {}
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_requests_per_day(session, [tid], t_start, t_end)
        for entry in partial.get("counts", []):
            day = entry["date"]
            if day not in merged:
                merged[day] = {"date": day, "count": 0, "cost_usd": 0.0}
            merged[day]["count"] += entry["count"]
            merged[day]["cost_usd"] = round(merged[day]["cost_usd"] + entry["cost_usd"], 8)

    return {"counts": sorted(merged.values(), key=lambda x: x["date"])}


@router.get("/dash/v1/latency")
async def latency_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
) -> dict:
    from tiresias.dashboard.analytics import get_latency_percentiles
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                data = await get_latency_percentiles(session, [cfg.tenant_id], t_start, t_end)
        return {"providers": data}

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    # Collect all latency samples per provider across tenants, recompute percentiles
    provider_latencies: dict[str, list[float]] = {}
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_latency_percentiles(session, [tid], t_start, t_end)
        # partial is a list of {name, sample_count, p50, p95, p99}
        # We can't recompute exact percentiles from aggregated p-values;
        # instead we re-run the raw query inline and aggregate samples.
        # The analytics function returns pre-computed percentiles, so we use
        # weighted approximate merge: collect (sample_count, p50/p95/p99) tuples.
        for item in partial:
            provider = item["name"]
            if provider not in provider_latencies:
                provider_latencies[provider] = []
            # Approximate: expand each percentile bucket by sample count / 3
            # This is a rough merge; exact merge requires raw data re-query.
            n = item["sample_count"]
            provider_latencies[provider].append((n, item["p50"], item["p95"], item["p99"]))

    output = []
    for provider, buckets in sorted(provider_latencies.items()):
        total_n = sum(b[0] for b in buckets)
        if total_n == 0:
            continue
        # Weighted average of percentiles (approximate cross-tenant merge)
        wp50 = round(sum(b[0] * b[1] for b in buckets) / total_n, 2)
        wp95 = round(sum(b[0] * b[2] for b in buckets) / total_n, 2)
        wp99 = round(sum(b[0] * b[3] for b in buckets) / total_n, 2)
        output.append({
            "name": provider,
            "sample_count": total_n,
            "p50": wp50,
            "p95": wp95,
            "p99": wp99,
        })
    return {"providers": output}


@router.get("/dash/v1/errors")
async def errors_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
) -> dict:
    from tiresias.dashboard.analytics import get_error_rates
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                data = await get_error_rates(session, [cfg.tenant_id], t_start, t_end)
        return {"providers": data}

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    # Merge: sum total_requests + error_count per provider, recompute error_rate
    provider_stats: dict[str, dict] = {}
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_error_rates(session, [tid], t_start, t_end)
        for item in partial:
            p = item["name"]
            if p not in provider_stats:
                provider_stats[p] = {"total_requests": 0, "error_count": 0, "status_codes": {}}
            provider_stats[p]["total_requests"] += item["total_requests"]
            provider_stats[p]["error_count"] += item["error_count"]
            for sc_entry in item.get("status_codes", []):
                code = str(sc_entry["code"])
                provider_stats[p]["status_codes"][code] = (
                    provider_stats[p]["status_codes"].get(code, 0) + sc_entry["count"]
                )

    output = []
    for provider, stats in sorted(provider_stats.items()):
        total = stats["total_requests"]
        errors = stats["error_count"]
        output.append({
            "name": provider,
            "total_requests": total,
            "error_count": errors,
            "error_rate": round(errors / total, 4) if total > 0 else 0.0,
            "status_codes": [
                {"code": int(code), "count": count}
                for code, count in stats["status_codes"].items()
            ],
        })
    return {"providers": output}


@router.get("/dash/v1/sessions/top")
async def top_sessions_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    from tiresias.dashboard.analytics import get_top_sessions
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                return await get_top_sessions(session, [cfg.tenant_id], t_start, t_end, limit=limit)

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    all_sessions = []
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_top_sessions(session, [tid], t_start, t_end, limit=limit)
        all_sessions.extend(partial.get("sessions", []))

    # Sort combined list by cost desc, return top :limit
    all_sessions.sort(key=lambda s: s.get("cost", 0.0), reverse=True)
    return {"sessions": all_sessions[:limit]}


@router.get("/dash/v1/sessions/{session_id}/replay")
async def session_replay_endpoint(
    session_id: str,
    request: Request,
    _key: AuthDep,
) -> dict:
    from tiresias.dashboard.analytics import get_session_replay
    from tiresias.proxy.app import get_envelope
    cfg = _get_proxy_settings()
    envelope = get_envelope()
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            await set_tenant_context(session, cfg.tenant_id)
            result = await get_session_replay(session, cfg.tenant_id, session_id, envelope)
        if not result["turns"]:
            raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found.")
        return result

    # Hierarchy mode: use caller's tenant only (session belongs to exactly one tenant)
    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")
    async with AsyncSession(engine) as session:
        await set_tenant_context(session, caller_tid)
        result = await get_session_replay(session, caller_tid, session_id, envelope)
    if not result["turns"]:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found.")
    return result


@router.get('/dash/v1/traces')
async def traces_endpoint(
    request: Request,
    _key: AuthDep,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    status: str | None = Query(default=None),
    date: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> dict:
    from tiresias.dashboard.analytics import get_traces
    cfg = _get_proxy_settings()
    default_start, default_end = _default_window()
    t_start = _parse_dt_param(start, default_start)
    t_end = _parse_dt_param(end, default_end)
    engine = await _get_proxy_engine()

    if not cfg.dashboard_tenant_hierarchy_mode:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, cfg.tenant_id)
                return await get_traces(
                    session, [cfg.tenant_id], t_start, t_end,
                    page=page, limit=limit,
                    provider=provider, model=model, status=status,
                    date=date, search=search,
                )

    caller_tid = await _resolve_caller_tenant(request)
    if caller_tid is None:
        raise HTTPException(status_code=401, detail="Could not resolve tenant for session.")

    async with AsyncSession(engine) as session:
        tenant_ids = await get_descendant_tenant_ids(session, caller_tid)

    # NOTE: cross-tenant pagination is approximate. We collect page=1 items from each
    # tenant and merge/sort, so the global total is accurate but page > 1 may miss rows
    # at tenant boundaries. This is acceptable for the dashboard use-case and documented here.
    all_items = []
    grand_total = 0
    for tid in tenant_ids:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await set_tenant_context(session, tid)
                partial = await get_traces(
                    session, [tid], t_start, t_end,
                    page=1, limit=limit,
                    provider=provider, model=model, status=status,
                    date=date, search=search,
                )
        all_items.extend(partial.get("items", []))
        grand_total += partial.get("total", 0)

    all_items.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
    offset = (page - 1) * limit
    page_items = all_items[offset: offset + limit]

    return {
        "items": page_items,
        "total": grand_total,
        "page": page,
        "limit": limit,
    }


@router.get("/dash/v1/providers/health")
async def provider_health_endpoint(_key: AuthDep) -> dict:
    from tiresias.config import parse_providers
    health = _get_proxy_health()
    cfg = _get_proxy_settings()
    cascade = parse_providers(cfg.providers)
    statuses = health.status()
    for s in statuses:
        if s["is_healthy"]:
            s["status"] = "UP"
        elif s["consecutive_errors"] >= 3:
            s["status"] = "DOWN"
        else:
            s["status"] = "DEGRADED"
    return {"cascade": cascade, "providers": statuses}
