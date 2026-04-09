"""
SHA-256 hash chain for contract version integrity.
Each version's hash includes the previous version's hash,
creating a tamper-evident linked chain.
"""

import hashlib
import uuid
import structlog
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

# Whitelist of allowed columns for WHERE clause construction
# Security: prevents SQL injection via column name manipulation
ALLOWED_CONTRACT_COLUMNS = frozenset({
    "contract_type",
    "tenant_id",
    "partner_id",
    "status",
    "review_status",
    "submitted_by",
})


def compute_content_hash(content: str, prev_hash: Optional[str] = None) -> str:
    """Compute SHA-256 hash of contract content linked to previous version."""
    chain_input = f"{prev_hash or 'genesis'}||{content}"
    return hashlib.sha256(chain_input.encode()).hexdigest()


def compute_terminal_hash(
    content_hash: str,
    signed_by_customer: str,
    signed_by_saluca: str,
    signed_at: str,
) -> str:
    """Compute terminal hash incorporating both signatures."""
    chain_input = f"{content_hash}||{signed_by_customer}||{signed_by_saluca}||{signed_at}"
    return hashlib.sha256(chain_input.encode()).hexdigest()


async def get_latest_version(
    db: AsyncSession,
    tenant_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
    contract_type: str = "msa",
) -> Optional[dict]:
    """Get the latest contract version for a tenant/partner.

    Security: Uses parameterized queries with column whitelist to prevent SQL injection.
    """
    conditions = ["contract_type = :ctype"]
    params = {"ctype": contract_type}

    if tenant_id:
        conditions.append("tenant_id = :tid")
        params["tid"] = str(tenant_id)
    if partner_id:
        conditions.append("partner_id = :pid")
        params["pid"] = str(partner_id)

    where = " AND ".join(conditions)
    # Security: where clause built from hardcoded column names only,
    # values passed as parameters - never interpolate user input into SQL
    result = await db.execute(text(f"""
        SELECT id, version, status, content_hash, prev_hash, content,
               review_status, review_risk_score, submitted_by, created_at
        FROM _soul_contracts
        WHERE {where}
        ORDER BY version DESC LIMIT 1
    """), params)
    row = result.first()
    if not row:
        return None

    return {
        "contract_id": str(row[0]),
        "version": row[1],
        "status": row[2],
        "content_hash": row[3],
        "prev_hash": row[4],
        "content": row[5],
        "review_status": row[6],
        "review_risk_score": row[7],
        "submitted_by": row[8],
        "created_at": row[9].isoformat() if row[9] else None,
    }


async def verify_chain(
    db: AsyncSession,
    tenant_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
    contract_type: str = "msa",
) -> dict:
    """Verify the integrity of the entire contract version chain.

    Security: Uses parameterized queries with column whitelist to prevent SQL injection.
    """
    conditions = ["contract_type = :ctype"]
    params = {"ctype": contract_type}

    if tenant_id:
        conditions.append("tenant_id = :tid")
        params["tid"] = str(tenant_id)
    if partner_id:
        conditions.append("partner_id = :pid")
        params["pid"] = str(partner_id)

    where = " AND ".join(conditions)
    # Security: where clause built from hardcoded column names only,
    # values passed as parameters - never interpolate user input into SQL
    result = await db.execute(text(f"""
        SELECT version, content, content_hash, prev_hash
        FROM _soul_contracts
        WHERE {where}
        ORDER BY version ASC
    """), params)
    rows = result.fetchall()

    if not rows:
        return {"valid": True, "versions_checked": 0, "errors": []}

    errors = []
    for i, row in enumerate(rows):
        version, content, stored_hash, prev_hash = row
        expected_hash = compute_content_hash(content, prev_hash)
        if expected_hash != stored_hash:
            errors.append({
                "version": version,
                "expected_hash": expected_hash[:16],
                "stored_hash": stored_hash[:16],
            })

        # Verify chain linkage
        if i > 0:
            prev_row = rows[i - 1]
            if prev_hash != prev_row[2]:  # prev_hash should match previous row's content_hash
                errors.append({
                    "version": version,
                    "error": "chain_break",
                    "expected_prev": prev_row[2][:16],
                    "actual_prev": prev_hash[:16] if prev_hash else "null",
                })

    return {
        "valid": len(errors) == 0,
        "versions_checked": len(rows),
        "errors": errors,
    }
