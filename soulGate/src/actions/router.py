"""
Action pipeline router — POST /gate/v1/actions/submit

Full flow:
  1. Authenticate caller (soulkey or action token)
  2. Validate & parse TiresiasActionRequest
  3. Evaluate policy (permit / deny / quarantine)
  4. If permitted, forward to downstream platform via PicoClaw
  5. Log the action + decision to _soulgate_action_log
  6. Return TiresiasActionResponse
"""

import time
import uuid
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.config.settings import get_settings
from soulGate.src.database.connection import async_session_factory
from soulGate.src.actions.models import (
    ActionType,
    TiresiasActionRequest,
    TiresiasActionResponse,
)
from soulGate.src.actions.policy import evaluate_action

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/gate/v1/actions", tags=["actions"])

# ---------------------------------------------------------------------------
# Shared httpx client for PicoClaw downstream calls
# ---------------------------------------------------------------------------
_picoclaw_client: Optional[httpx.AsyncClient] = None


def _get_picoclaw_client() -> httpx.AsyncClient:
    global _picoclaw_client
    if _picoclaw_client is None or _picoclaw_client.is_closed:
        _picoclaw_client = httpx.AsyncClient(
            base_url=settings.picoclaw_base_url,
            timeout=httpx.Timeout(30.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        )
    return _picoclaw_client


async def close_picoclaw_client():
    """Gracefully close the PicoClaw httpx client on shutdown."""
    global _picoclaw_client
    if _picoclaw_client and not _picoclaw_client.is_closed:
        await _picoclaw_client.aclose()
        _picoclaw_client = None


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def _verify_action_token(
    x_action_token: Optional[str] = Header(None, alias="X-Action-Token"),
    authorization: Optional[str] = Header(None),
):
    """
    Verify the caller is authorized to submit actions.
    Accepts either X-Action-Token header or Bearer token.
    """
    token = x_action_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Missing action token")

    expected = settings.picoclaw_action_token
    if not expected:
        logger.warning("actions.no_token_configured", detail="SOULGATE_PICOCLAW_ACTION_TOKEN not set")
        raise HTTPException(status_code=503, detail="Action pipeline not configured")

    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid action token")


# ---------------------------------------------------------------------------
# Action log persistence
# ---------------------------------------------------------------------------
async def _log_action(
    req: TiresiasActionRequest,
    decision: str,
    policy_name: Optional[str],
    rule_name: Optional[str],
    downstream_status: Optional[int],
    response_time_ms: Optional[float],
    source_ip: Optional[str],
):
    """Write action to _soulgate_action_log."""
    try:
        async with async_session_factory() as db:
            await db.execute(
                text("""
                    INSERT INTO _soulgate_action_log
                        (id, tenant_id, soulkey_id, persona_id, action_id,
                         action_type, target_platform, target_channel,
                         decision, policy_name, rule_name,
                         downstream_status, response_time_ms,
                         simulation_id, source_ip)
                    VALUES
                        (:id, :tenant_id, :soulkey_id, :persona_id, :action_id,
                         :action_type, :target_platform, :target_channel,
                         :decision, :policy_name, :rule_name,
                         :downstream_status, :response_time_ms,
                         :simulation_id, :source_ip)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "tenant_id": str(req.tenant_id) if req.tenant_id else None,
                    "soulkey_id": str(req.soulkey_id) if req.soulkey_id else None,
                    "persona_id": req.persona_id,
                    "action_id": str(req.action_id),
                    "action_type": req.action_type.value,
                    "target_platform": req.target_platform,
                    "target_channel": req.target_channel,
                    "decision": decision,
                    "policy_name": policy_name,
                    "rule_name": rule_name,
                    "downstream_status": downstream_status,
                    "response_time_ms": response_time_ms,
                    "simulation_id": req.simulation_id,
                    "source_ip": source_ip,
                },
            )
            await db.commit()
    except Exception:
        logger.exception("actions.log_failed", action_id=str(req.action_id))


# ---------------------------------------------------------------------------
# Downstream dispatch
# ---------------------------------------------------------------------------
async def _forward_to_picoclaw(req: TiresiasActionRequest) -> tuple[int, dict]:
    """
    Forward a permitted action to PicoClaw for execution.
    Returns (status_code, response_body).
    """
    client = _get_picoclaw_client()
    try:
        resp = await client.post(
            "/v1/actions/execute",
            json={
                "action_id": str(req.action_id),
                "action_type": req.action_type.value,
                "persona_id": req.persona_id,
                "target_platform": req.target_platform,
                "target_channel": req.target_channel,
                "payload": req.payload,
                "simulation": req.simulation,
            },
            headers={"X-Action-Token": settings.picoclaw_action_token or ""},
        )
        body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        return resp.status_code, body
    except httpx.TimeoutException:
        logger.error("actions.picoclaw_timeout", action_id=str(req.action_id))
        return 504, {"error": "downstream_timeout"}
    except httpx.ConnectError:
        logger.error("actions.picoclaw_connect_error", action_id=str(req.action_id))
        return 502, {"error": "downstream_unreachable"}
    except Exception as e:
        logger.exception("actions.picoclaw_error", action_id=str(req.action_id))
        return 500, {"error": str(e)}


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------
@router.post("/submit", response_model=TiresiasActionResponse)
async def submit_action(
    action: TiresiasActionRequest,
    request: Request,
    _auth: None = Depends(_verify_action_token),
):
    """
    Submit an action for policy evaluation and downstream execution.

    Flow: authenticate -> validate -> policy check -> forward -> log -> respond
    """
    t0 = time.monotonic()
    source_ip = request.client.host if request.client else None

    logger.info(
        "actions.submit",
        action_id=str(action.action_id),
        action_type=action.action_type.value,
        persona_id=action.persona_id,
        simulation=action.simulation,
        source_ip=source_ip,
    )

    # Policy evaluation
    policy_result = await evaluate_action(action)

    if not policy_result.allowed:
        elapsed = (time.monotonic() - t0) * 1000
        denial = policy_result.denial
        await _log_action(
            req=action,
            decision="deny",
            policy_name=denial.policy_name if denial else None,
            rule_name=denial.rule_name if denial else None,
            downstream_status=None,
            response_time_ms=elapsed,
            source_ip=source_ip,
        )
        return TiresiasActionResponse(
            action_id=action.action_id,
            decision="deny",
            denial=denial,
            response_time_ms=elapsed,
            simulation=action.simulation,
        )

    # Forward to PicoClaw (skip for simulation-only requests)
    downstream_status = None
    downstream_body = None
    if not action.simulation:
        downstream_status, downstream_body = await _forward_to_picoclaw(action)
    else:
        downstream_body = {"simulation": True, "note": "Action not executed"}

    elapsed = (time.monotonic() - t0) * 1000

    # Log
    await _log_action(
        req=action,
        decision="permit",
        policy_name=None,
        rule_name=None,
        downstream_status=downstream_status,
        response_time_ms=elapsed,
        source_ip=source_ip,
    )

    logger.info(
        "actions.completed",
        action_id=str(action.action_id),
        decision="permit",
        downstream_status=downstream_status,
        response_time_ms=round(elapsed, 2),
    )

    return TiresiasActionResponse(
        action_id=action.action_id,
        decision="permit",
        downstream_status=downstream_status,
        downstream_body=downstream_body,
        response_time_ms=round(elapsed, 2),
        simulation=action.simulation,
    )
