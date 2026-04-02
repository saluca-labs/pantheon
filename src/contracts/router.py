"""
Contract automation router — hash-chain verified negotiation pipeline.

Endpoints:
  POST /v1/contracts/submit      — submit proposed contract (creates new version)
  GET  /v1/contracts/latest       — get latest version for tenant/partner
  GET  /v1/contracts/chain/verify — verify chain integrity
  POST /v1/contracts/sign         — sign agreed contract (creates terminal hash)
  POST /v1/contracts/discount     — generate discount code from signed contract
"""

import os
import uuid
import hashlib
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.contracts.chain import compute_content_hash, compute_terminal_hash, get_latest_version, verify_chain
from src.contracts.review import review_contract_delta

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/contracts", tags=["Contracts"])

# Standard contract templates (in production, load from file/DB)
STANDARD_TEMPLATES = {
    "msa": "Standard Master Service Agreement — Tiresias AI Security Platform...",
    "nda": "Standard Non-Disclosure Agreement — Saluca LLC...",
    "sla": "Standard Service Level Agreement — 99.9% uptime...",
}


# --- Schemas ---

class SubmitContractRequest(BaseModel):
    contract_type: str = Field("msa", description="Contract type: msa, nda, sla")
    content: str = Field(..., min_length=10, description="Proposed contract content")
    tenant_id: Optional[uuid.UUID] = None
    partner_id: Optional[uuid.UUID] = None

class ContractVersionResponse(BaseModel):
    contract_id: str
    version: int
    status: str
    content_hash: str
    prev_hash: Optional[str]
    review_status: Optional[str]
    review_risk_score: Optional[float]
    flagged_clauses: Optional[list] = None
    submitted_by: str
    created_at: Optional[str]

class SignContractRequest(BaseModel):
    contract_id: str
    signed_by_customer: str = Field(..., description="Customer signer identity")
    signed_by_saluca: str = Field("Cristian Ruvalcaba, CEO Saluca LLC", description="Saluca signer")
    pricing_terms: Optional[dict] = Field(None, description="Agreed pricing terms")

class SignContractResponse(BaseModel):
    contract_id: str
    terminal_hash: str
    status: str
    signed_at: str
    discount_code: Optional[str] = None

class ChainVerifyResponse(BaseModel):
    valid: bool
    versions_checked: int
    errors: list

class GenerateDiscountRequest(BaseModel):
    contract_id: str
    discount_percent: float = Field(..., ge=1.0, le=99.0)
    duration_months: int = Field(12, ge=1, le=60)


# --- Endpoints ---

@router.post("/submit", response_model=ContractVersionResponse, summary="Submit proposed contract")
async def submit_contract(
    body: SubmitContractRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContractVersionResponse:
    """Submit a proposed contract version. Runs AI review and chains to previous version."""
    submitter = request.headers.get("X-Tenant-ID", "anonymous")

    # Get previous version for chain linking
    prev = await get_latest_version(db, body.tenant_id, body.partner_id, body.contract_type)
    prev_hash = prev["content_hash"] if prev else None
    version = (prev["version"] + 1) if prev else 1

    # Compute content hash (linked to previous)
    content_hash = compute_content_hash(body.content, prev_hash)

    # AI-assisted review
    standard = STANDARD_TEMPLATES.get(body.contract_type, "")
    review = await review_contract_delta(standard, body.content, body.contract_type)

    # Persist
    contract_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        INSERT INTO _soul_contracts
            (id, tenant_id, partner_id, contract_type, version, status, content,
             content_hash, prev_hash, submitted_by, review_status, review_notes,
             review_risk_score, created_at)
        VALUES (:id, :tid, :pid, :ctype, :ver, :status, :content,
                :hash, :prev, :by, :rstatus, :rnotes, :rscore, :now)
    """), {
        "id": contract_id,
        "tid": str(body.tenant_id) if body.tenant_id else None,
        "pid": str(body.partner_id) if body.partner_id else None,
        "ctype": body.contract_type,
        "ver": version,
        "status": "review" if review["review_status"] != "auto_accept" else "accepted",
        "content": body.content,
        "hash": content_hash,
        "prev": prev_hash,
        "by": submitter,
        "rstatus": review["review_status"],
        "rnotes": str(review.get("suggestions", [])),
        "rscore": review["risk_score"],
        "now": now,
    })
    await db.commit()

    return ContractVersionResponse(
        contract_id=contract_id,
        version=version,
        status="review" if review["review_status"] != "auto_accept" else "accepted",
        content_hash=content_hash,
        prev_hash=prev_hash,
        review_status=review["review_status"],
        review_risk_score=review["risk_score"],
        flagged_clauses=review.get("flagged_clauses"),
        submitted_by=submitter,
        created_at=now.isoformat(),
    )


@router.get("/latest", response_model=Optional[ContractVersionResponse], summary="Get latest contract version")
async def get_latest(
    contract_type: str = Query("msa"),
    tenant_id: Optional[uuid.UUID] = Query(None),
    partner_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    latest = await get_latest_version(db, tenant_id, partner_id, contract_type)
    if not latest:
        raise HTTPException(status_code=404, detail="No contract found")
    return ContractVersionResponse(**latest, flagged_clauses=None)


@router.get("/chain/verify", response_model=ChainVerifyResponse, summary="Verify contract chain integrity")
async def verify_contract_chain(
    contract_type: str = Query("msa"),
    tenant_id: Optional[uuid.UUID] = Query(None),
    partner_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ChainVerifyResponse:
    result = await verify_chain(db, tenant_id, partner_id, contract_type)
    return ChainVerifyResponse(**result)


@router.post("/sign", response_model=SignContractResponse, summary="Sign agreed contract")
async def sign_contract(
    body: SignContractRequest,
    db: AsyncSession = Depends(get_db),
) -> SignContractResponse:
    """Sign a contract — computes terminal hash incorporating both signatures."""
    result = await db.execute(text(
        "SELECT id, content_hash, status FROM _soul_contracts WHERE id = :cid"
    ), {"cid": body.contract_id})
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    if row[2] not in ("accepted", "review"):
        raise HTTPException(status_code=400, detail=f"Contract status must be 'accepted', got '{row[2]}'")

    now = datetime.now(timezone.utc)
    terminal_hash = compute_terminal_hash(
        row[1], body.signed_by_customer, body.signed_by_saluca, now.isoformat()
    )

    await db.execute(text("""
        UPDATE _soul_contracts
        SET status = 'signed',
            signed_by_customer = :cust,
            signed_by_saluca = :saluca,
            signed_at = :now,
            terminal_hash = :thash,
            pricing_terms = :terms
        WHERE id = :cid
    """), {
        "cid": body.contract_id,
        "cust": body.signed_by_customer,
        "saluca": body.signed_by_saluca,
        "now": now,
        "thash": terminal_hash,
        "terms": __import__("json").dumps(body.pricing_terms) if body.pricing_terms else None,
    })
    await db.commit()

    return SignContractResponse(
        contract_id=body.contract_id,
        terminal_hash=terminal_hash,
        status="signed",
        signed_at=now.isoformat(),
    )


@router.post("/discount", summary="Generate discount code from signed contract")
async def generate_contract_discount(
    body: GenerateDiscountRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a Stripe discount code tied to a signed contract's terminal hash."""
    result = await db.execute(text(
        "SELECT terminal_hash, partner_id, status FROM _soul_contracts WHERE id = :cid"
    ), {"cid": body.contract_id})
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    if row[2] != "signed":
        raise HTTPException(status_code=400, detail="Contract must be signed before generating discount")

    terminal_hash = row[0]
    partner_id = row[1]

    # Generate code from terminal hash
    code = f"CONTRACT-{terminal_hash[:8].upper()}"

    try:
        from src.partner.promo import create_partner_coupon, create_promo_code
        coupon = await create_partner_coupon(
            partner_id=str(partner_id) if partner_id else "saluca",
            discount_percent=body.discount_percent,
            duration_months=body.duration_months,
            name=f"Contract {body.contract_id[:8]} - {body.discount_percent}% off",
        )
        promo = await create_promo_code(
            coupon_id=coupon["coupon_id"],
            code=code,
            partner_id=str(partner_id) if partner_id else "saluca",
        )

        # Store discount code on contract
        await db.execute(text(
            "UPDATE _soul_contracts SET discount_code = :code WHERE id = :cid"
        ), {"code": code, "cid": body.contract_id})
        await db.commit()

        return {
            "contract_id": body.contract_id,
            "discount_code": code,
            "terminal_hash": terminal_hash,
            "promo_code_id": promo["promo_code_id"],
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create discount: {exc}")
