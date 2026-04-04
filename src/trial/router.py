"""
Trial API router — self-service registration and verification.
Implements SPEC.md section 16 API endpoints.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.auth.schemas import (
    TrialRegistrationRequest,
    TrialRegistrationResponse,
    TrialVerifyRequest,
    TrialActivationResponse,
)
from src.trial.service import register_trial, verify_trial, activate_trial, verify_and_activate_trial
from src.trial.email import send_verification_email
from src.middleware.rate_limit import check_trial_rate_limit, validate_email_domain

router = APIRouter(prefix="/v1/trial", tags=["Trial"])
verify_router = APIRouter(tags=["Trial"])


@router.post(
    "/register",
    response_model=TrialRegistrationResponse,
    summary="Register for a free trial",
    dependencies=[Depends(check_trial_rate_limit)],
    responses={
        200: {"description": "Trial registered, verification email sent"},
        400: {"description": "Disposable email domain blocked", "content": {"application/json": {"example": {"detail": "Disposable email domains are not allowed"}}}},
        409: {"description": "Trial already exists for this domain", "content": {"application/json": {"example": {"detail": "A trial already exists for example.com. Check your email or contact support."}}}},
        429: {"description": "Rate limit exceeded", "content": {"application/json": {"example": {"detail": "Too many registration attempts. Try again later."}}}},
    },
)
async def trial_register(
    request: TrialRegistrationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register for a 14-day Tiresias Pro trial.

    No authentication required. Sends a verification email to the provided
    address. After verification, a tenant and SoulKey are automatically
    provisioned.

    Anti-abuse protections:
    - IP rate limiting: 3 registrations/hour, 10/day
    - Disposable email domains blocked
    - One trial per company domain
    """
    # Validate email domain is not disposable
    validate_email_domain(request.contact_email)

    try:
        trial, verification_token = await register_trial(
            db=db,
            contact_name=request.contact_name,
            contact_email=request.contact_email,
            company_name=request.company_name,
            company_domain=request.company_domain,
            use_case=request.use_case,
        )
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"A trial already exists for {request.company_domain}. Check your email or contact support.",
        )

    # Send verification email via Resend
    await send_verification_email(
        contact_name=request.contact_name,
        contact_email=request.contact_email,
        company_name=request.company_name,
        trial_id=str(trial.id),
        verification_token=verification_token,
    )

    return TrialRegistrationResponse(
        trial_id=trial.id,
        status="pending",
        message="Verification email sent. Please check your inbox to activate your trial.",
        verification_required=True,
    )


@router.post(
    "/verify",
    response_model=TrialActivationResponse,
    summary="Verify email and activate trial",
    responses={
        200: {"description": "Trial activated, SoulKey issued (shown once)"},
        400: {"description": "Invalid or expired verification token"},
        500: {"description": "Trial activation failed"},
    },
)
async def trial_verify(
    request: TrialVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a trial registration email and activate the trial.

    On success, provisions a new tenant and issues a trial SoulKey.
    The raw key in the response is shown exactly once - save it immediately.
    The trial includes 14 days of Pro-tier access.
    """
    # Atomic verify + activate to prevent race conditions and token reuse
    activation = await verify_and_activate_trial(
        db, request.trial_id, request.verification_token
    )
    if not activation:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification token",
        )

    # Fire welcome email (EMAIL-01, non-fatal)
    try:
        import asyncio as _asyncio
        from src.email.triggers import on_registration as _email_on_registration
        _asyncio.create_task(_email_on_registration(
            contact_name=activation.get("contact_name") or "there",
            contact_email=activation["contact_email"],
            soulkey=activation["raw_key"],
        ))
    except Exception:
        pass

    return TrialActivationResponse(
        trial_id=activation["trial_id"],
        tenant_id=activation["tenant_id"],
        soulkey_id=activation["soulkey_id"],
        raw_key=activation["raw_key"],
        status=activation["status"],
        expires_at=activation["expires_at"],
    )


def _verify_page_html(status: str, **kwargs) -> str:
    """Render the verification result as a branded HTML page."""
    if status == "success":
        a = kwargs
        body = f"""
        <div style="text-align:left;max-width:480px;margin:0 auto;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(34,197,94,0.1);display:flex;align-items:center;justify-content:center;">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#4ade80" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#e5e7eb;">Trial Activated</h1>
              <p style="margin:2px 0 0;font-size:14px;color:#9ca3af;">Your 14-day SoulAuth Pro trial is live.</p>
            </div>
          </div>
          <div style="background:#0a0e1a;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:24px;">
            <div style="margin-bottom:16px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Tenant ID</p>
              <p style="margin:0;font-size:13px;font-family:monospace;color:#e5e7eb;word-break:break-all;">{a['tenant_id']}</p>
            </div>
            <div style="margin-bottom:16px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">SoulKey ID</p>
              <p style="margin:0;font-size:13px;font-family:monospace;color:#e5e7eb;word-break:break-all;">{a['soulkey_id']}</p>
            </div>
            <div style="margin-bottom:16px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">API Key (shown once - save now)</p>
              <div style="background:#111827;border:1px solid rgba(212,168,83,0.2);border-radius:8px;padding:12px;">
                <p style="margin:0;font-size:13px;font-family:monospace;color:#d4a853;word-break:break-all;" id="apikey">{a['raw_key']}</p>
              </div>
              <p style="margin:6px 0 0;font-size:11px;color:#ef4444;">This key will not be shown again.</p>
            </div>
            <div>
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Trial Expires</p>
              <p style="margin:0;font-size:13px;font-family:monospace;color:#e5e7eb;">{a['expires_at']}</p>
            </div>
          </div>
          <div style="background:#0a0e1a;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#e5e7eb;">Quick start</p>
            <pre style="margin:0;font-size:12px;font-family:monospace;color:#2dd4bf;white-space:pre-wrap;line-height:1.6;">pip install soulauth

export SOULAUTH_API_KEY="{a['raw_key'][:12]}..."

curl -H "X-SoulKey: $SOULAUTH_API_KEY" \\
  https://tiresias.network/v1/auth/whoami</pre>
          </div>
          <div style="display:flex;gap:12px;">
            <a href="https://tiresias.network/docs" style="flex:1;text-align:center;padding:12px 20px;background:#d4a853;color:#0a0e1a;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">API Docs</a>
          </div>
        </div>"""
    elif status == "error":
        body = f"""
        <div style="text-align:center;max-width:400px;margin:0 auto;">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#f87171" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </div>
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#e5e7eb;">Verification Failed</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#9ca3af;">{kwargs.get('message', 'Invalid or expired verification link.')}</p>
          <a href="mailto:support@tiresias.network" style="padding:12px 24px;background:#d4a853;color:#0a0e1a;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Contact Support</a>
        </div>"""
    else:
        body = ""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>SoulAuth Trial Verification</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;">
    <div style="margin-bottom:32px;text-align:center;">
      <h2 style="margin:0;font-size:20px;font-weight:700;color:#d4a853;letter-spacing:0.5px;">TIRESIAS</h2>
      <p style="margin:4px 0 0;font-size:11px;color:#6b7280;letter-spacing:1px;">SOULAUTH PLATFORM</p>
    </div>
    <div style="background:#111827;border:1px solid #1f2937;border-radius:16px;padding:40px;width:100%;max-width:560px;">
      {body}
    </div>
    <p style="margin:32px 0 0;font-size:12px;color:#4b5563;">Tiresias by Saluca Labs</p>
  </div>
</body></html>"""


@verify_router.get(
    "/trial/verify",
    response_class=HTMLResponse,
    summary="Email verification landing page",
    responses={
        200: {"description": "Branded HTML page showing activation result"},
    },
)
async def trial_verify_get(
    trial_id: str = Query(..., description="Trial UUID from verification email"),
    token: str = Query(..., description="Verification token from email link"),
    db: AsyncSession = Depends(get_db),
):
    """
    GET endpoint for email verification links.

    This is the URL embedded in verification emails. Verifies the token,
    activates the trial, provisions a tenant and SoulKey, and renders
    a branded HTML page with the results and quickstart instructions.
    """
    try:
        tid = uuid.UUID(trial_id)
    except ValueError:
        return HTMLResponse(_verify_page_html("error", message="Invalid trial ID."))

    # Atomic verify + activate to prevent race conditions
    activation = await verify_and_activate_trial(db, tid, token)
    if not activation:
        return HTMLResponse(_verify_page_html("error", message="Invalid or expired verification link. It may have already been used."))

    # Fire welcome email (EMAIL-01, non-fatal)
    try:
        import asyncio as _asyncio
        from src.email.triggers import on_registration as _email_on_registration
        _asyncio.create_task(_email_on_registration(
            contact_name=activation.get("contact_name") or "there",
            contact_email=activation["contact_email"],
            soulkey=activation["raw_key"],
        ))
    except Exception:
        pass

    return HTMLResponse(_verify_page_html(
        "success",
        tenant_id=str(activation["tenant_id"]),
        soulkey_id=str(activation["soulkey_id"]),
        raw_key=activation["raw_key"],
        expires_at=str(activation["expires_at"].strftime("%B %d, %Y") if hasattr(activation["expires_at"], "strftime") else activation["expires_at"]),
    ))
