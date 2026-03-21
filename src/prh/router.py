"""
PRH configuration and inspection API.

Endpoints:
  GET  /v1/prh/config          — get current tenant PRH config
  PUT  /v1/prh/config          — update tenant PRH config (partial update)
  GET  /v1/prh/recent          — get recent PRH scores for this tenant
  GET  /v1/prh/stats           — aggregate stats (avg score, flagged count, category breakdown)
  POST /v1/prh/analyze         — on-demand prompt analysis (no audit log, returns result)
"""

from __future__ import annotations

import uuid
from collections import deque, defaultdict
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/prh", tags=["PRH"])

# In-memory ring buffer of recent scores per tenant
# { tenant_id_str -> deque of result dicts (max 500) }
_recent_scores: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PRHConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    auto_quarantine_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    enabled_categories: Optional[list[str]] = None


class PRHAnalyzeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=32000)
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _require_tenant(request: Request) -> str:
    """Extract tenant_id string from request.state.tenant (set by TenantContextMiddleware)."""
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(status_code=401, detail="Tenant context required")
    return str(tenant.tenant_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/config", summary="Get PRH configuration")
async def get_config(request: Request):
    """Get current PRH configuration for the authenticated tenant."""
    from src.prh._state import get_tenant_config
    tid = _require_tenant(request)
    config = get_tenant_config(tid)
    return {"tenant_id": tid, "config": config}


@router.put("/config", summary="Update PRH configuration")
async def update_config(request: Request, body: PRHConfigUpdate):
    """
    Update PRH configuration for the authenticated tenant.
    Partial updates supported — only provided fields are changed.
    Changes take effect on the next analyzed request.
    """
    from src.prh._state import set_tenant_config
    tid = _require_tenant(request)

    update_dict = body.model_dump(exclude_none=True)

    if "enabled_categories" in update_dict:
        from src.prh.patterns import CATEGORIES
        invalid = set(update_dict["enabled_categories"]) - set(CATEGORIES)
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid categories: {sorted(invalid)}. Valid: {CATEGORIES}",
            )

    updated = set_tenant_config(tid, update_dict)
    return {"tenant_id": tid, "config": updated}


@router.get("/recent", summary="Get recent PRH scores")
async def get_recent(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
):
    """Return the most recent PRH analysis results for this tenant (ring buffer, max 500)."""
    tid = _require_tenant(request)
    recent = list(_recent_scores[tid])[-limit:]
    return {"tenant_id": tid, "count": len(recent), "results": recent}


@router.get("/stats", summary="Get PRH aggregate statistics")
async def get_stats(request: Request):
    """Return aggregate PRH statistics for the tenant: total scored, flagged count, avg score, category breakdown."""
    tid = _require_tenant(request)
    results = list(_recent_scores[tid])

    if not results:
        return {
            "tenant_id": tid,
            "total_scored": 0,
            "flagged_count": 0,
            "avg_score": 0.0,
            "category_breakdown": {},
        }

    flagged = [r for r in results if r.get("flagged")]
    avg_score = sum(r.get("score", 0) for r in results) / len(results)

    category_breakdown: dict[str, int] = defaultdict(int)
    for r in results:
        cat = r.get("category")
        if cat:
            category_breakdown[cat] += 1

    return {
        "tenant_id": tid,
        "total_scored": len(results),
        "flagged_count": len(flagged),
        "avg_score": round(avg_score, 4),
        "category_breakdown": dict(category_breakdown),
    }


@router.post("/analyze", summary="On-demand prompt analysis")
async def analyze_prompt(request: Request, body: PRHAnalyzeRequest):
    """
    Analyze a prompt on-demand. Returns PRH result immediately.
    Does NOT write to audit log or emit Sigma events.
    Intended for testing and dashboard preview.
    """
    from src.prh._state import get_prh_analyzer, get_tenant_config

    tid = _require_tenant(request)
    config = get_tenant_config(tid)
    threshold = body.threshold if body.threshold is not None else config.get("threshold", 0.5)

    analyzer = get_prh_analyzer()
    result = analyzer.analyze(body.prompt, threshold=threshold)

    # Store in ring buffer
    _recent_scores[tid].append({
        **result.to_dict(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "tenant_id": tid,
        "result": result.to_dict(),
    }
