"""
Auth API router - identity resolution and PDP evaluation.
Implements SPEC.md Appendix A auth endpoints.
"""

import uuid
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.auth.soulkey import resolve_identity
from src.auth.pdp import evaluate as pdp_evaluate
from src.auth.schemas import (
    IdentityResponse,
    AuthEvaluateRequest,
    AuthEvaluateResponse,
    WhoamiResponse,
)

router = APIRouter(prefix="/v1/auth", tags=["Auth"])


@router.get(
    "/identity",
    response_model=IdentityResponse,
    summary="Resolve agent identity from SoulKey",
    responses={
        200: {
            "description": "Identity successfully resolved",
            "content": {
                "application/json": {
                    "example": {
                        "soulkey_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        "tenant_id": "11111111-1111-1111-1111-111111111111",
                        "persona_id": "alfred",
                        "status": "active",
                        "label": "Production orchestrator",
                        "issued_at": "2026-03-18T00:00:00Z",
                        "expires_at": None,
                        "last_used_at": "2026-03-18T12:00:00Z",
                    }
                }
            },
        },
        401: {
            "description": "Invalid or unknown SoulKey",
            "content": {"application/json": {"example": {"detail": "Invalid soulkey"}}},
        },
    },
)
async def identity_resolution(
    x_soulkey: str = Header(..., alias="X-Soulkey", description="Agent SoulKey for authentication"),
    db: AsyncSession = Depends(get_db),
):
    """
    Resolve agent identity from a SoulKey.

    Given a valid SoulKey in the `X-SoulKey` header, returns the associated
    persona, tenant, status, and metadata. This is the primary identity
    resolution endpoint used by agents to verify their own identity and
    by services to validate incoming agent requests.

    The SoulKey is matched against stored SHA-512 hashes - the raw key
    is never stored. Returns 401 if the key is unknown.
    """
    soulkey = await resolve_identity(db, x_soulkey)
    if not soulkey:
        raise HTTPException(status_code=401, detail="Invalid soulkey")

    return IdentityResponse(
        soulkey_id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        status=soulkey.status,
        label=soulkey.label,
        issued_at=soulkey.issued_at,
        expires_at=soulkey.expires_at,
        last_used_at=soulkey.last_used_at,
    )


@router.post(
    "/evaluate",
    response_model=AuthEvaluateResponse,
    summary="Evaluate access request (PDP)",
    responses={
        200: {
            "description": "Access decision returned",
            "content": {
                "application/json": {
                    "examples": {
                        "grant": {
                            "summary": "Access granted with capability token",
                            "value": {
                                "decision": "grant",
                                "capability_token": "eyJhbGciOiJFUzI1NiIs...",
                                "expires_in": 300,
                                "granted_scopes": ["memory:read:cs:algorithms"],
                                "reason": None,
                                "escalation_available": False,
                                "escalation_approver_role": None,
                                "audit_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                            },
                        },
                        "deny": {
                            "summary": "Access denied with reason",
                            "value": {
                                "decision": "deny",
                                "capability_token": None,
                                "expires_in": None,
                                "granted_scopes": None,
                                "reason": "no matching scope in policy",
                                "escalation_available": True,
                                "escalation_approver_role": "orchestrator",
                                "audit_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                            },
                        },
                    }
                }
            },
        },
        401: {
            "description": "Invalid SoulKey",
            "content": {"application/json": {"example": {"detail": "Invalid soulkey"}}},
        },
    },
)
async def evaluate_access(
    request: AuthEvaluateRequest,
    x_soulkey: str = Header(..., alias="X-Soulkey", description="Agent SoulKey for authentication"),
    db: AsyncSession = Depends(get_db),
):
    """
    Policy Decision Point (PDP) - evaluate an access request against the agent's policy.

    This is the core authorization endpoint. Given a resource, action, and scope,
    the PDP evaluates the requesting agent's policy (loaded from database cache)
    and returns either GRANT with a short-lived capability token or DENY with
    a reason and optional escalation path.

    Capability tokens are ES256-signed JWTs valid for the policy-defined TTL
    (default 300s, max 900s). They encode the granted scopes and can be
    validated offline by PEP sidecars.

    The evaluation also considers active delegations - if another agent has
    delegated access to the requesting agent, that delegation is honored.
    """
    decision = await pdp_evaluate(
        db=db,
        raw_soulkey=x_soulkey,
        resource=request.resource,
        action=request.action,
        scope=request.scope,
        context=request.context or {},
        user_context=request.user_context,
    )

    return AuthEvaluateResponse(
        decision=decision.decision,
        capability_token=decision.capability_token,
        expires_in=decision.expires_in,
        granted_scopes=decision.granted_scopes,
        reason=decision.reason,
        escalation_available=decision.escalation_available,
        escalation_approver_role=decision.escalation_approver_role,
        audit_id=decision.audit_id,
    )


@router.get(
    "/whoami",
    response_model=WhoamiResponse,
    summary="Agent self-inspection",
    responses={
        200: {
            "description": "Agent identity and policy summary",
            "content": {
                "application/json": {
                    "example": {
                        "persona_id": "alfred",
                        "tenant_id": "11111111-1111-1111-1111-111111111111",
                        "soulkey_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        "status": "active",
                        "active_capabilities": 0,
                        "policy_summary": {
                            "role": "orchestrator",
                            "resources": ["memory", "vault", "mesh"],
                            "max_capability_ttl": 900,
                            "allowed_nodes": ["*"],
                        },
                    }
                }
            },
        },
        401: {
            "description": "Invalid SoulKey",
            "content": {"application/json": {"example": {"detail": "Invalid soulkey"}}},
        },
    },
)
async def whoami(
    x_soulkey: str = Header(..., alias="X-Soulkey", description="Agent SoulKey for authentication"),
    db: AsyncSession = Depends(get_db),
):
    """
    Agent self-inspection endpoint.

    Returns the agent's persona, tenant, status, and a summary of their
    policy permissions. Useful for agents to verify their own identity
    and understand what resources they can access.

    This endpoint is lightweight and suitable for health-check or
    bootstrap flows where an agent needs to confirm its identity.
    """
    soulkey = await resolve_identity(db, x_soulkey)
    if not soulkey:
        raise HTTPException(status_code=401, detail="Invalid soulkey")

    # Load policy for summary
    from src.policy.loader import load_cached_policy

    policy = await load_cached_policy(db, soulkey.tenant_id, soulkey.persona_id)
    policy_summary = None
    if policy:
        policy_summary = {
            "role": policy.role,
            "resources": list(policy.resources.keys()),
            "max_capability_ttl": policy.jit.max_capability_ttl,
            "allowed_nodes": policy.jit.allowed_nodes,
        }

    return WhoamiResponse(
        persona_id=soulkey.persona_id,
        tenant_id=soulkey.tenant_id,
        soulkey_id=soulkey.id,
        status=soulkey.status,
        policy_summary=policy_summary,
    )
