"""
Waitlist API router — waitlist email collection.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from src.database.connection import get_db
from src.database.models import Waitlist
from src.auth.schemas import WaitlistJoinRequest, WaitlistJoinResponse
from src.middleware.rate_limit import check_trial_rate_limit, validate_email_domain
from src.waitlist.email import send_waitlist_confirmation_email

router = APIRouter(prefix="/v1/waitlist", tags=["Waitlist"])


@router.post(
    "/join",
    response_model=WaitlistJoinResponse,
    summary="Join the waitlist",
    dependencies=[Depends(check_trial_rate_limit)],
    responses={
        200: {"description": "Added to waitlist"},
        400: {"description": "Disposable email domain blocked"},
        409: {"description": "Email already on waitlist"},
        429: {"description": "Rate limit exceeded"},
    },
)
async def waitlist_join(
    request: WaitlistJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Join the Tiresias waitlist.

    Collects contact information for early access notification.
    No tenant or SoulKey is provisioned at this stage.
    """
    validate_email_domain(request.contact_email)

    entry = Waitlist(
        contact_name=request.contact_name,
        contact_email=request.contact_email,
        company_name=request.company_name,
        company_domain=request.company_domain,
        use_case=request.use_case,
        status="pending",
    )

    try:
        db.add(entry)
        await db.flush()
        await db.refresh(entry)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This email is already on the waitlist. We'll be in touch soon.",
        )

    # Get position in waitlist
    count_result = await db.execute(
        select(func.count(Waitlist.id)).where(Waitlist.status == "pending")
    )
    position = count_result.scalar() or 1

    await send_waitlist_confirmation_email(
        contact_name=request.contact_name,
        contact_email=request.contact_email,
        company_name=request.company_name,
        position=position,
    )

    return WaitlistJoinResponse(
        waitlist_id=entry.id,
        status="pending",
        message="You're on the list! We'll notify you when beta access is available.",
        position=position,
    )
