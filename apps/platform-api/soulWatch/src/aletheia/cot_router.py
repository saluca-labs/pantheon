"""
Aletheia Chain-of-Thought (CoT) Hash Chain REST API for SoulWatch.
Provides endpoints to list, inspect, verify, and export CoT chain entries.

All endpoints gated to enterprise/mssp tier via require_permission("aletheia:read").
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import AletheiaCotChain, AletheiaCotContent
from src.auth.rbac import require_permission

router = APIRouter(
    prefix="/watch/v1/aletheia/cot",
    tags=["aletheia-cot"],
    dependencies=[Depends(require_permission("aletheia:read"))],
)


def _parse_iso(value: Optional[str], label: str) -> Optional[datetime]:
    """Parse an ISO-8601 string or raise 400."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid '{label}' datetime format")


def _serialize_chain_entry(entry: AletheiaCotChain) -> dict:
    """Convert a chain entry model instance to a JSON-safe dict."""
    return {
        "request_id": str(entry.request_id),
        "model": entry.model,
        "provider": entry.provider,
        "cot_token_count": entry.cot_token_count,
        "timestamp": entry.timestamp.isoformat() if entry.timestamp else None,
        "chain_hash": entry.entry_hash,
        "prev_hash": entry.prev_hash,
        "agent_id": entry.agent_id,
        "entry_index": entry.entry_index,
        "chain_id": str(entry.chain_id),
    }


# ---------------------------------------------------------------------------
# GET /chain  -- list chain entries
# ---------------------------------------------------------------------------


@router.get("/chain")
async def list_chain_entries(
    tenant_id: str = Query(..., description="Tenant UUID"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    since: Optional[str] = Query(None, description="ISO-8601 start"),
    until: Optional[str] = Query(None, description="ISO-8601 end"),
    db: AsyncSession = Depends(get_db),
):
    """List CoT chain entries with optional time filtering and pagination."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    since_dt = _parse_iso(since, "since")
    until_dt = _parse_iso(until, "until")

    q = (
        select(AletheiaCotChain)
        .where(AletheiaCotChain.tenant_id == tid)
        .order_by(AletheiaCotChain.timestamp.desc())
    )

    if since_dt:
        q = q.where(AletheiaCotChain.timestamp >= since_dt)
    if until_dt:
        q = q.where(AletheiaCotChain.timestamp <= until_dt)

    # Total count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginated rows
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    return {
        "entries": [_serialize_chain_entry(r) for r in rows],
        "total": total,
    }


# ---------------------------------------------------------------------------
# GET /chain/{request_id}/content  -- get CoT content for a request
# ---------------------------------------------------------------------------


@router.get("/chain/{request_id}/content")
async def get_chain_content(
    request_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get CoT content for a specific request."""
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request_id format")

    # Find chain entry
    result = await db.execute(
        select(AletheiaCotChain).where(AletheiaCotChain.request_id == rid)
    )
    chain_entry = result.scalar_one_or_none()
    if not chain_entry:
        raise HTTPException(status_code=404, detail="Chain entry not found")

    # Find content
    content_result = await db.execute(
        select(AletheiaCotContent).where(
            AletheiaCotContent.chain_entry_id == chain_entry.id
        )
    )
    content = content_result.scalar_one_or_none()

    if not content:
        return {"content": None, "encrypted": False}

    # Content exists but decryption key management not yet wired
    return {"content": None, "encrypted": True}


# ---------------------------------------------------------------------------
# POST /chain/verify  -- verify hash chain integrity
# ---------------------------------------------------------------------------


class VerifyRequest(BaseModel):
    start_index: int = 0
    end_index: int = -1


@router.post("/chain/verify")
async def verify_chain(
    body: VerifyRequest,
    tenant_id: str = Query(..., description="Tenant UUID"),
    db: AsyncSession = Depends(get_db),
):
    """Verify hash chain integrity by walking entries and checking prev_hash linkage."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    q = (
        select(AletheiaCotChain)
        .where(AletheiaCotChain.tenant_id == tid)
        .order_by(AletheiaCotChain.entry_index.asc())
    )

    if body.start_index > 0:
        q = q.where(AletheiaCotChain.entry_index >= body.start_index)
    if body.end_index >= 0:
        q = q.where(AletheiaCotChain.entry_index <= body.end_index)

    rows = (await db.execute(q)).scalars().all()

    if not rows:
        return {"valid": True, "broken_at": None, "checked_entries": 0}

    for i in range(1, len(rows)):
        if rows[i].prev_hash != rows[i - 1].entry_hash:
            return {
                "valid": False,
                "broken_at": rows[i].entry_index,
                "checked_entries": i + 1,
            }

    return {
        "valid": True,
        "broken_at": None,
        "checked_entries": len(rows),
    }


# ---------------------------------------------------------------------------
# POST /chain/proof  -- export proof document
# ---------------------------------------------------------------------------


class ProofRequest(BaseModel):
    format: str = "json"


@router.post("/chain/proof")
async def export_proof(
    body: ProofRequest,
    tenant_id: str = Query(..., description="Tenant UUID"),
    db: AsyncSession = Depends(get_db),
):
    """Export a proof document of the full CoT hash chain for a tenant."""
    if body.format != "json":
        raise HTTPException(status_code=400, detail="Only 'json' format is supported")

    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    rows = (
        await db.execute(
            select(AletheiaCotChain)
            .where(AletheiaCotChain.tenant_id == tid)
            .order_by(AletheiaCotChain.entry_index.asc())
        )
    ).scalars().all()

    entries = []
    for r in rows:
        entries.append({
            "entry_index": r.entry_index,
            "request_id": str(r.request_id),
            "chain_id": str(r.chain_id),
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "model": r.model,
            "provider": r.provider,
            "agent_id": r.agent_id,
            "cot_hash": r.cot_hash,
            "cot_token_count": r.cot_token_count,
            "cot_byte_count": r.cot_byte_count,
            "prev_hash": r.prev_hash,
            "entry_hash": r.entry_hash,
            "content_stored": r.content_stored,
        })

    # Verify chain inline
    chain_valid = True
    broken_at = None
    for i in range(1, len(rows)):
        if rows[i].prev_hash != rows[i - 1].entry_hash:
            chain_valid = False
            broken_at = rows[i].entry_index
            break

    return {
        "tenant_id": str(tid),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_entries": len(entries),
        "chain_valid": chain_valid,
        "broken_at": broken_at,
        "first_entry_hash": entries[0]["entry_hash"] if entries else None,
        "last_entry_hash": entries[-1]["entry_hash"] if entries else None,
        "entries": entries,
    }
