"""
Compliance and executive report endpoints for SoulWatch.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.reports.compliance import (
    generate_soc2_report,
    generate_iso27001_report,
    generate_nist_report,
    generate_executive_report,
)

router = APIRouter(prefix="/watch/v1/reports", tags=["reports"])


@router.get("/compliance")
async def compliance_report(
    framework: str = Query(..., description="Framework: soc2, iso27001, or nist"),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Generate a compliance report mapped to a control framework."""
    generators = {
        "soc2": generate_soc2_report,
        "iso27001": generate_iso27001_report,
        "nist": generate_nist_report,
    }

    generator = generators.get(framework.lower())
    if not generator:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown framework '{framework}'. Supported: soc2, iso27001, nist",
        )

    return await generator(db, days=days)


@router.get("/executive")
async def executive_report(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """High-level executive security summary."""
    return await generate_executive_report(db, days=days)
