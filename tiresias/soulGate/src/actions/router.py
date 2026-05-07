"""
Action submission endpoint.
POST /gate/v1/actions/submit

Pipeline:
1. Parse TiresiasActionRequest
2. Authenticate via validate_request_auth
3. Rate limit check
4. Action policy evaluation
5. Forward to PicoClaw for execution
6. Audit log
7. Return TiresiasActionResponse
"""

import time
import uuid
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from soulGate.config.settings import get_settings
from soulGate.src.database.connection import get_db
from soulGate.src.database.models import SoulGateActionLog
from soulGate.src.auth.token_validator import validate_request_auth, AuthResult
from soulGate.src.ratelimit.engine import check_rate_limit, RateLimitResult
from soulGate.src.actions.models import (
    TiresiasActionRequest,
    TiresiasActionResponse,
    DenialInfo,
    PolicyDecision,
)
from soulGate.src.actions.policy import evaluate_action

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/gate/v1/actions", tags=["actions"])

# Shared httpx client for PicoClaw forwarding
_picoclaw_client: Optional[httpx.AsyncClient] = None


def _get_picoclaw_client() -> httpx.AsyncClient:
    """Get or create the shared httpx client for PicoClaw."""
    global _picoclaw_client
    if _picoclaw_client is None or _picoclaw_client.is_closed:
        _picoclaw_client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0),
            follow_redirects=False,
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=10,
            ),
        )
    return _picoclaw_client


async def close_picoclaw_client():
    """Close the shared PicoClaw httpx client on shutdown."""
    global _picoclaw_client
    if _picoclaw_client and not _picoclaw_client.is_closed:
        await _picoclaw_client.aclose()
        _picoclaw_client = None


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _get_session_factory():
    """Get the async session factory for direct DB writes."""
    from soulGate.src.database.connection import async_session_factory
    return async_session_factory


async def _write_action_log(
    tenant_id: Optional[uuid.UUID],
    soulkey_id: Optional[uuid.UUID],
    persona_id: Optional[str],
    action_id: uuid.UUID,
    action_type: str,
    target_platform: Optional[str],
    target_channel: Optional[str],
    decision: str,
    policy_name: Optional[str],
    rule_name: Optional[str],
    downstream_status: Optional[int],
    response_time_ms: Optional[float],
    simulation_id: Optional[str],
    source_ip: Optional[str],
):
    """Write an action audit log entry to the database."""
    session_factory = _get_session_factory()
    try:
        async with session_factory() as db:
            entry = SoulGateActionLog(
                tenant_id=tenant_id,
                soulkey_id=soulkey_id,
                persona_id=persona_id,
                action_id=action_id,
                action_type=action_type,
                target_platform=target_platform,
                target_channel=target_channel,
                decision=decision,
                policy_name=policy_name,
                rule_name=rule_name,
                downstream_status=downstream_status,
                response_time_ms=response_time_ms,
                simulation_id=simulation_id,
                source_ip=source_ip,
            )
            db.add(entry)
            await db.commit()
            logger.debug("action_audit.written", action_id=str(action_id))
    except Exception as e:
        logger.error("action_audit.write_failed", error=str(e), action_id=str(action_id))


@router.post("/submit", response_model=TiresiasActionResponse)
async def submit_action(
    action: TiresiasActionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a Tiresias action through the SoulGate security pipeline.

    Authenticates the caller, evaluates action policy, forwards to
    PicoClaw for execution, and logs the full transaction to the
    action audit table.
    """
    start_time = time.monotonic()
    source_ip = _get_client_ip(request)
    auth_result: Optional[AuthResult] = None
    decision_str = "permit"
    policy_name: Optional[str] = None
    rule_name: Optional[str] = None
    downstream_status: Optional[int] = None
    simulation_id: Optional[str] = None

    if action.simulation_context and isinstance(action.simulation_context, dict):
        simulation_id = action.simulation_context.get("simulation_id")

    try:
        # 1. Authenticate
        auth_result = await validate_request_auth(request, db)
        if not auth_result.authenticated:
            logger.warning(
                "action.auth_failed",
                action_id=str(action.action_id),
                error=auth_result.error,
                source_ip=source_ip,
            )
            return JSONResponse(
                status_code=401,
                content={
                    "detail": auth_result.error or "Authentication required",
                    "blocked_by": "soulgate",
                },
            )

        # 2. Rate limit check
        rl_result: RateLimitResult = await check_rate_limit(
            tenant_id=str(auth_result.tenant_id) if auth_result.tenant_id else "default",
            soulkey_id=str(auth_result.soulkey_id) if auth_result.soulkey_id else None,
            endpoint="/gate/v1/actions/submit",
        )
        if not rl_result.allowed:
            logger.warning(
                "action.rate_limited",
                action_id=str(action.action_id),
                tenant_id=str(auth_result.tenant_id),
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after": rl_result.retry_after,
                },
                headers={"Retry-After": str(rl_result.retry_after)},
            )

        # 3. Action policy evaluation
        policy_decision: PolicyDecision = await evaluate_action(auth_result, action, db)

        if not policy_decision.allowed:
            decision_str = "deny"
            policy_name = policy_decision.policy_name
            rule_name = policy_decision.rule_name

            logger.info(
                "action.denied",
                action_id=str(action.action_id),
                policy_name=policy_name,
                rule_name=rule_name,
                reason=policy_decision.reason,
            )

            return TiresiasActionResponse(
                action_id=action.action_id,
                status="denied",
                denied_by=DenialInfo(
                    policy_name=policy_decision.policy_name or "unknown",
                    rule_name=policy_decision.rule_name or "unknown",
                    policy_level="action",
                    reason=policy_decision.reason,
                ),
            )

        # 4. Forward to PicoClaw
        picoclaw_url = f"{settings.picoclaw_base_url}/api/v1/actions/execute"
        client = _get_picoclaw_client()

        forward_headers = {
            "Content-Type": "application/json",
            "X-Tiresias-Token": settings.picoclaw_action_token,
        }
        if auth_result.tenant_id:
            forward_headers["X-Tenant-ID"] = str(auth_result.tenant_id)
        if auth_result.soulkey_id:
            forward_headers["X-SoulKey-ID"] = str(auth_result.soulkey_id)
        if auth_result.persona_id:
            forward_headers["X-Persona-ID"] = auth_result.persona_id
        forward_headers["X-Forwarded-By"] = "SoulGate/1.0"

        try:
            picoclaw_response = await client.post(
                picoclaw_url,
                content=action.model_dump_json(),
                headers=forward_headers,
            )
            downstream_status = picoclaw_response.status_code

            if 200 <= downstream_status < 300:
                try:
                    result_data = picoclaw_response.json()
                except Exception:
                    result_data = {"raw": picoclaw_response.text}

                logger.info(
                    "action.executed",
                    action_id=str(action.action_id),
                    action_type=action.action_type.value,
                    persona_id=action.persona_id,
                    downstream_status=downstream_status,
                )

                return TiresiasActionResponse(
                    action_id=action.action_id,
                    status="executed",
                    result=result_data,
                )
            else:
                error_text = picoclaw_response.text[:500]
                logger.error(
                    "action.downstream_error",
                    action_id=str(action.action_id),
                    downstream_status=downstream_status,
                    error=error_text,
                )

                return TiresiasActionResponse(
                    action_id=action.action_id,
                    status="failed",
                    error=f"PicoClaw returned {downstream_status}: {error_text}",
                )

        except httpx.TimeoutException:
            logger.error(
                "action.picoclaw_timeout",
                action_id=str(action.action_id),
                picoclaw_url=picoclaw_url,
            )
            return JSONResponse(
                status_code=504,
                content={
                    "detail": "PicoClaw execution timed out",
                    "blocked_by": "soulgate",
                },
            )

        except httpx.ConnectError:
            logger.error(
                "action.picoclaw_unreachable",
                action_id=str(action.action_id),
                picoclaw_url=picoclaw_url,
            )
            return JSONResponse(
                status_code=502,
                content={
                    "detail": "PicoClaw service unreachable",
                    "blocked_by": "soulgate",
                },
            )

    finally:
        # 5. Audit log
        elapsed_ms = (time.monotonic() - start_time) * 1000.0

        await _write_action_log(
            tenant_id=auth_result.tenant_id if auth_result else None,
            soulkey_id=auth_result.soulkey_id if auth_result else None,
            persona_id=action.persona_id,
            action_id=action.action_id,
            action_type=action.action_type.value,
            target_platform=action.target.platform,
            target_channel=action.target.channel,
            decision=decision_str,
            policy_name=policy_name,
            rule_name=rule_name,
            downstream_status=downstream_status,
            response_time_ms=elapsed_ms,
            simulation_id=simulation_id,
            source_ip=source_ip,
        )
