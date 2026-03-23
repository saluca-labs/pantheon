"""
Model routing middleware -- intercepts LLM proxy requests and enforces model policies.

Sits between PEP and ProviderRouter. For requests to /v1/chat/completions:
1. Extract requested model from body
2. Extract task_type from X-Task-Type header (optional)
3. Call PDP.evaluate_model_access()
4. If denied: return 403 with reason
5. If redirected: rewrite body["model"] to resolved_model
6. If granted: pass through
7. Log decision to audit
"""

import json
import structlog
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response, JSONResponse

from src.auth.pdp import evaluate_model_access, ModelAccessDecision
from src.database.session import get_async_session

logger = structlog.get_logger(__name__)

# Paths that trigger model routing enforcement
MODEL_ROUTED_PREFIXES = [
    "/v1/chat/completions",
    "/v1/completions",
    "/v1/embeddings",
]


def _is_model_routed(path: str) -> bool:
    """Check if a path requires model routing enforcement."""
    for prefix in MODEL_ROUTED_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


class ModelRoutingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware -- enforces model routing policies on LLM proxy requests.

    Reads the soulkey from X-Soulkey header (already validated by PEP if on
    a protected path, or passed directly for model routing).
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        if not _is_model_routed(path):
            return await call_next(request)

        # Read request body (we need to parse the model field)
        body_bytes = await request.body()
        try:
            body = json.loads(body_bytes) if body_bytes else {}
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {}

        requested_model = body.get("model", "")
        if not requested_model:
            # No model specified -- let downstream handle the error
            return await call_next(request)

        # Extract soulkey and task context
        soulkey = request.headers.get("X-Soulkey", "")
        task_type = request.headers.get("X-Task-Type", None)
        estimated_cost_str = request.headers.get("X-Estimated-Cost-USD", None)
        estimated_cost = float(estimated_cost_str) if estimated_cost_str else None

        if not soulkey:
            # No soulkey -- skip model routing (unauthenticated request)
            logger.debug("model_router.no_soulkey", path=path)
            return await call_next(request)

        # Evaluate model access via PDP
        async with get_async_session() as db:
            decision: ModelAccessDecision = await evaluate_model_access(
                db=db,
                raw_soulkey=soulkey,
                requested_model=requested_model,
                task_type=task_type,
                estimated_cost_usd=estimated_cost,
                context={
                    "path": path,
                    "method": request.method,
                    "client_ip": request.client.host if request.client else "unknown",
                },
            )
            await db.commit()

        if decision.decision == "deny":
            logger.warning(
                "model_router.denied",
                path=path,
                requested_model=requested_model,
                task_type=task_type,
                reason=decision.reason,
            )
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "message": f"Model access denied: {decision.reason}",
                        "type": "model_policy_violation",
                        "requested_model": decision.requested_model,
                        "enforcement_mode": decision.enforcement_mode,
                    }
                },
            )

        if decision.decision == "redirect":
            logger.info(
                "model_router.redirect",
                path=path,
                from_model=requested_model,
                to_model=decision.resolved_model,
                reason=decision.reason,
            )
            # Rewrite the model in the request body
            body["model"] = decision.resolved_model
            # Store the rewritten body so downstream can read it.
            # ASGI does not support mutating the request body in-place, so
            # downstream middleware and route handlers MUST read from
            # request.state.rewritten_body instead of calling request.body().
            request.state.rewritten_body = json.dumps(body).encode("utf-8")
            request.state.model_redirected = True
            request.state.original_model = requested_model

        # Grant -- pass through
        logger.info(
            "model_router.granted",
            path=path,
            model=decision.resolved_model,
            task_type=task_type,
            reason=decision.reason,
        )

        # Store decision metadata for downstream consumers.
        # Downstream middleware and route handlers read request.state.model_decision
        # for audit logging, cost tracking, and response header enrichment.
        request.state.model_decision = decision

        response = await call_next(request)

        # Add model routing headers to response
        response.headers["X-Model-Resolved"] = decision.resolved_model
        response.headers["X-Model-Decision"] = decision.decision
        if decision.cost_remaining_usd is not None:
            response.headers["X-Cost-Remaining-USD"] = f"{decision.cost_remaining_usd:.2f}"

        return response
