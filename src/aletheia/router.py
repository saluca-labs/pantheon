"""
Aletheia CoT API router.
Provides prove-without-exposing chain queries, encrypted content retrieval,
chain verification, and proof export endpoints.

All endpoints gated to enterprise+ tier via feature_gate middleware
(route prefix /v1/aletheia maps to aletheia_cot_intercept feature).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from src.aletheia.chain import verify_chain_range
from src.aletheia.models import AletheiaCoTChain, AletheiaCoTContent
from src.aletheia.storage import CotContentStorage
from src.database.connection import async_session_factory

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/aletheia/cot", tags=["Aletheia CoT"])


# ------------------------------------------------------------------
# Pydantic schemas
# ------------------------------------------------------------------

class ChainEntryResponse(BaseModel):
    id: str
    chain_id: str
    entry_index: int
    request_id: str
    timestamp: str
    model: str
    provider: str
    agent_id: Optional[str] = None
    cot_hash: str
    cot_token_count: int
    cot_byte_count: int
    prev_hash: str
    entry_hash: str
    content_stored: bool


class ChainListResponse(BaseModel):
    entries: list[ChainEntryResponse]
    total: int


class ContentResponse(BaseModel):
    request_id: str
    reasoning_content: str
    token_count: int


class ChainVerifyResponse(BaseModel):
    valid: bool
    entries_checked: int
    first_broken_index: Optional[int] = None
    error: Optional[str] = None


class ProofExportRequest(BaseModel):
    tenant_id: str
    request_ids: Optional[list[str]] = None
    from_index: Optional[int] = None
    to_index: Optional[int] = None
    include_content: bool = False


class ProofDocument(BaseModel):
    version: str = "1.0"
    generated_at: str
    tenant_id: str
    chain_id: str
    entries: list[dict]
    chain_valid: bool
    verification_hash: str


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _entry_to_response(entry: AletheiaCoTChain) -> ChainEntryResponse:
    """Convert a chain ORM object to a response model (hash only, no content)."""
    return ChainEntryResponse(
        id=str(entry.id),
        chain_id=str(entry.chain_id),
        entry_index=entry.entry_index,
        request_id=str(entry.request_id),
        timestamp=entry.timestamp.isoformat(),
        model=entry.model,
        provider=entry.provider,
        agent_id=entry.agent_id,
        cot_hash=entry.cot_hash,
        cot_token_count=entry.cot_token_count,
        cot_byte_count=entry.cot_byte_count,
        prev_hash=entry.prev_hash,
        entry_hash=entry.entry_hash,
        content_stored=entry.content_stored,
    )


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get(
    "/chain",
    response_model=ChainListResponse,
    summary="List CoT chain entries (prove-without-exposing)",
    description=(
        "Returns chain entry metadata and hashes. Never returns content. "
        "This is the default audit endpoint for compliance: proves CoT was "
        "captured without exposing reasoning content."
    ),
)
async def list_chain_entries(
    tenant_id: str = Query(..., description="Tenant UUID"),
    from_ts: Optional[str] = Query(None, description="ISO timestamp lower bound"),
    to_ts: Optional[str] = Query(None, description="ISO timestamp upper bound"),
    agent_id: Optional[str] = Query(None, description="Filter by agent_id"),
    model: Optional[str] = Query(None, description="Filter by model name"),
    limit: int = Query(50, ge=1, le=500, description="Max entries to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """List chain entries with hash proofs only (ALETH-11)."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id UUID")

    async with async_session_factory() as session:
        q = select(AletheiaCoTChain).where(AletheiaCoTChain.tenant_id == tid)

        if from_ts:
            q = q.where(AletheiaCoTChain.timestamp >= datetime.fromisoformat(from_ts))
        if to_ts:
            q = q.where(AletheiaCoTChain.timestamp <= datetime.fromisoformat(to_ts))
        if agent_id:
            q = q.where(AletheiaCoTChain.agent_id == agent_id)
        if model:
            q = q.where(AletheiaCoTChain.model == model)

        # Count total
        count_q = select(func.count()).select_from(q.subquery())
        total = (await session.execute(count_q)).scalar() or 0

        # Fetch page
        q = q.order_by(AletheiaCoTChain.entry_index.asc()).limit(limit).offset(offset)
        result = await session.execute(q)
        entries = list(result.scalars().all())

    return ChainListResponse(
        entries=[_entry_to_response(e) for e in entries],
        total=total,
    )


@router.get(
    "/chain/{request_id}",
    response_model=ChainEntryResponse,
    summary="Get single chain entry by request_id",
    description="Returns hash proof for a single request. No content exposed.",
)
async def get_chain_entry(
    request_id: str,
    tenant_id: str = Query(..., description="Tenant UUID"),
):
    """Get a single chain entry by request_id (ALETH-11)."""
    try:
        tid = uuid.UUID(tenant_id)
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    async with async_session_factory() as session:
        result = await session.execute(
            select(AletheiaCoTChain)
            .where(
                AletheiaCoTChain.tenant_id == tid,
                AletheiaCoTChain.request_id == rid,
            )
        )
        entry = result.scalar_one_or_none()

    if entry is None:
        raise HTTPException(status_code=404, detail="Chain entry not found")

    return _entry_to_response(entry)


@router.get(
    "/chain/{request_id}/content",
    response_model=ContentResponse,
    summary="Retrieve decrypted CoT content",
    description=(
        "Decrypts and returns the stored CoT reasoning content. "
        "Requires audit:read scope. Content access is logged in the audit trail. "
        "Returns 404 if content was not stored for this entry."
    ),
)
async def get_chain_content(
    request_id: str,
    tenant_id: str = Query(..., description="Tenant UUID"),
):
    """Retrieve decrypted content for a chain entry (ALETH-10).

    Requires audit:read scope (enforced by PEP middleware on this path).
    """
    try:
        tid = uuid.UUID(tenant_id)
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    # Find the chain entry
    async with async_session_factory() as session:
        result = await session.execute(
            select(AletheiaCoTChain)
            .where(
                AletheiaCoTChain.tenant_id == tid,
                AletheiaCoTChain.request_id == rid,
            )
        )
        entry = result.scalar_one_or_none()

    if entry is None:
        raise HTTPException(status_code=404, detail="Chain entry not found")

    if not entry.content_stored:
        raise HTTPException(
            status_code=404,
            detail="Content not stored for this entry (hash-only mode)",
        )

    # Decrypt content
    storage = CotContentStorage(async_session_factory)
    plaintext = await storage.retrieve_content(entry.id, tid)

    if plaintext is None:
        raise HTTPException(status_code=500, detail="Failed to decrypt content")

    # Log content access for audit trail
    logger.info(
        "aletheia.content_accessed",
        tenant_id=str(tid),
        request_id=str(rid),
        chain_entry_id=str(entry.id),
        token_count=entry.cot_token_count,
    )

    return ContentResponse(
        request_id=str(rid),
        reasoning_content=plaintext,
        token_count=entry.cot_token_count,
    )


@router.get(
    "/verify",
    response_model=ChainVerifyResponse,
    summary="Verify chain integrity over a range",
    description=(
        "Validates the hash chain integrity from from_index to to_index. "
        "Returns whether the chain is valid and the first broken link index if invalid."
    ),
)
async def verify_chain(
    tenant_id: str = Query(..., description="Tenant UUID"),
    from_index: int = Query(0, ge=0, description="Start index (inclusive)"),
    to_index: int = Query(1000, ge=0, description="End index (inclusive)"),
):
    """Verify chain integrity over an arbitrary range (ALETH-12)."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id UUID")

    async with async_session_factory() as session:
        # Determine the chain_id for this tenant
        result = await session.execute(
            select(AletheiaCoTChain.chain_id)
            .where(AletheiaCoTChain.tenant_id == tid)
            .limit(1)
        )
        chain_id = result.scalar_one_or_none()

        if chain_id is None:
            raise HTTPException(status_code=404, detail="No chain found for tenant")

        verification = await verify_chain_range(
            session=session,
            tenant_id=tid,
            chain_id=chain_id,
            from_index=from_index,
            to_index=to_index,
        )

    return ChainVerifyResponse(**verification)


@router.post(
    "/proof",
    response_model=ProofDocument,
    summary="Export hashed audit proof document",
    description=(
        "Generates a structured JSON proof document containing chain entry hashes, "
        "chain verification result, and a verification_hash (SHA-512) for tamper detection. "
        "Optionally includes decrypted content if include_content=True and audit:read scope is held."
    ),
)
async def export_proof(body: ProofExportRequest):
    """Generate a proof export document (ALETH-16)."""
    try:
        tid = uuid.UUID(body.tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id UUID")

    async with async_session_factory() as session:
        # Build query for requested entries
        q = select(AletheiaCoTChain).where(AletheiaCoTChain.tenant_id == tid)

        if body.request_ids:
            req_uuids = []
            for rid in body.request_ids:
                try:
                    req_uuids.append(uuid.UUID(rid))
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid request_id: {rid}")
            q = q.where(AletheiaCoTChain.request_id.in_(req_uuids))
        elif body.from_index is not None and body.to_index is not None:
            q = q.where(
                AletheiaCoTChain.entry_index >= body.from_index,
                AletheiaCoTChain.entry_index <= body.to_index,
            )

        q = q.order_by(AletheiaCoTChain.entry_index.asc())
        result = await session.execute(q)
        entries = list(result.scalars().all())

        if not entries:
            raise HTTPException(status_code=404, detail="No entries found for proof export")

        chain_id = entries[0].chain_id

        # Build proof entries
        proof_entries = []
        storage = CotContentStorage(async_session_factory) if body.include_content else None

        for entry in entries:
            proof_entry = {
                "entry_index": entry.entry_index,
                "request_id": str(entry.request_id),
                "timestamp": entry.timestamp.isoformat(),
                "model": entry.model,
                "provider": entry.provider,
                "agent_id": entry.agent_id,
                "cot_hash": entry.cot_hash,
                "cot_token_count": entry.cot_token_count,
                "prev_hash": entry.prev_hash,
                "entry_hash": entry.entry_hash,
                "content_stored": entry.content_stored,
            }

            if body.include_content and entry.content_stored and storage:
                content = await storage.retrieve_content(entry.id, tid)
                if content:
                    proof_entry["reasoning_content"] = content

            proof_entries.append(proof_entry)

        # Verify chain integrity for the range
        min_idx = entries[0].entry_index
        max_idx = entries[-1].entry_index
        verification = await verify_chain_range(
            session=session,
            tenant_id=tid,
            chain_id=chain_id,
            from_index=min_idx,
            to_index=max_idx,
        )

    # Compute verification hash over the serialized entries
    entries_json = json.dumps(proof_entries, sort_keys=True, default=str)
    verification_hash = hashlib.sha512(entries_json.encode("utf-8")).hexdigest()

    now = datetime.now(timezone.utc)

    logger.info(
        "aletheia.proof_exported",
        tenant_id=str(tid),
        chain_id=str(chain_id),
        entries_count=len(proof_entries),
        chain_valid=verification["valid"],
    )

    return ProofDocument(
        version="1.0",
        generated_at=now.isoformat(),
        tenant_id=str(tid),
        chain_id=str(chain_id),
        entries=proof_entries,
        chain_valid=verification["valid"],
        verification_hash=verification_hash,
    )
