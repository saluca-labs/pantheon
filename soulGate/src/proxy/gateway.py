"""
Core reverse proxy gateway pipeline.
Orchestrates auth, access control, rate limiting, circuit breaking,
payload inspection, upstream forwarding, and audit logging.
"""

import asyncio
import time
from typing import Optional

import httpx
import structlog
from fastapi import Request
from starlette.responses import JSONResponse, Response

from soulGate.config.settings import get_settings
from soulGate.src.database.models import SoulGateUpstream
from soulGate.src.auth.token_validator import validate_request_auth, AuthResult
from soulGate.src.access.ip_filter import check_ip_access
from soulGate.src.ratelimit.engine import check_rate_limit, RateLimitResult
from soulGate.src.circuit.breaker import get_breaker, CircuitOpenError
from soulGate.src.inspection.scanner import scan_request
from soulGate.src.inspection.prompt_guard import scan_for_injection, ThreatMatch
from soulGate.src.audit.logger import enqueue_log_entry
from soulGate.src.monitoring.metrics import (
    REQUESTS_TOTAL,
    REQUEST_DURATION,
    BLOCKS_TOTAL,
    RATE_LIMIT_HITS,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

# Shared httpx client with connection pooling
_http_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create the shared httpx async client."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.proxy_timeout_ms / 1000.0),
            follow_redirects=False,
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
            ),
        )
    return _http_client


async def close_http_client():
    """Close the shared httpx client on shutdown."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


async def _safe_cot_append(writer, extraction, request_id, auth_result):
    """Fire-and-forget CoT chain append with error handling."""
    try:
        entry = await writer.append(extraction, request_id, auth_result.persona_id)
        logger.debug(
            "cot_intercept.appended",
            entry_index=entry.entry_index,
            tenant_id=str(auth_result.tenant_id),
        )
    except Exception as e:
        logger.error("cot_intercept.append_failed", error=str(e))


def _get_session_factory():
    """Get the async session factory for database operations."""
    from soulGate.src.database.connection import async_session_factory
    return async_session_factory


async def process_request(
    request: Request,
    upstream: SoulGateUpstream,
    path: str,
    db,
) -> Response:
    """
    Core gateway pipeline:
    1. Validate auth (token or API key)
    2. Check IP/geo access rules
    3. Check rate limits
    4. Check circuit breaker
    5. Inspect payload (prompt injection, size)
    6. Forward to upstream via httpx
    6b. CoT intercept (read-only, fire-and-forget)
    7. Log to audit
    Return response or error
    """
    start_time = time.monotonic()
    source_ip = _get_client_ip(request)
    auth_result: Optional[AuthResult] = None
    blocked = False
    block_reason: Optional[str] = None
    threat_flags: list[dict] = []
    cot_policy_injected: bool = False
    response_status: Optional[int] = None
    response_size: Optional[int] = None

    try:
        # 1. Validate auth
        auth_result = await validate_request_auth(request, db)
        if not auth_result.authenticated:
            blocked = True
            block_reason = f"auth_failed: {auth_result.error}"
            BLOCKS_TOTAL.labels(reason="auth_failed").inc()
            return _block_response(401, auth_result.error or "Authentication required")

        # 1b. Validate tenant tier for this path
        if auth_result.tenant_id:
            from soulGate.src.auth.tier_validator import validate_tier_for_path
            tier_ok, tier_reason = await validate_tier_for_path(
                auth_result.tenant_id, path, db
            )
            if not tier_ok:
                blocked = True
                block_reason = f"tier_denied: {tier_reason}"
                BLOCKS_TOTAL.labels(reason="tier_denied").inc()
                return _block_response(402, tier_reason or "Feature not available for your tier")

        # 2. Check IP access rules
        ip_allowed, ip_reason = await check_ip_access(
            source_ip, auth_result.tenant_id, db
        )
        if not ip_allowed:
            blocked = True
            block_reason = f"ip_denied: {ip_reason}"
            BLOCKS_TOTAL.labels(reason="ip_denied").inc()
            return _block_response(403, ip_reason or "IP address denied")

        # 3. Check rate limits
        rl_result: RateLimitResult = await check_rate_limit(
            tenant_id=str(auth_result.tenant_id) if auth_result.tenant_id else "default",
            soulkey_id=str(auth_result.soulkey_id) if auth_result.soulkey_id else None,
            endpoint=request.url.path,
        )
        if not rl_result.allowed:
            blocked = True
            block_reason = "rate_limited"
            BLOCKS_TOTAL.labels(reason="rate_limited").inc()
            RATE_LIMIT_HITS.inc()
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": rl_result.retry_after},
                headers={"Retry-After": str(rl_result.retry_after)},
            )

        # 4. Check circuit breaker
        if upstream.circuit_breaker_enabled:
            breaker = get_breaker(str(upstream.id))
            try:
                breaker.check()
            except CircuitOpenError:
                blocked = True
                block_reason = f"circuit_open: {upstream.name}"
                BLOCKS_TOTAL.labels(reason="circuit_open").inc()
                return _block_response(503, f"Upstream {upstream.name} is unavailable (circuit open)")

        # 5. Inspect payload
        body_bytes = await request.body()

        # Size check
        if len(body_bytes) > settings.max_request_body_bytes:
            blocked = True
            block_reason = "payload_too_large"
            BLOCKS_TOTAL.labels(reason="payload_too_large").inc()
            return _block_response(413, "Request body too large")

        # Prompt injection scan
        if settings.prompt_guard_enabled and body_bytes:
            threats: list[ThreatMatch] = scan_for_injection(body_bytes.decode("utf-8", errors="replace"))
            blocking_threats = [t for t in threats if t.action == "block"]
            if blocking_threats:
                blocked = True
                block_reason = f"prompt_injection: {blocking_threats[0].pattern_name}"
                threat_flags = [t.to_dict() for t in threats]
                BLOCKS_TOTAL.labels(reason="prompt_injection").inc()
                return _block_response(
                    400,
                    f"Request blocked: prompt injection detected ({blocking_threats[0].pattern_name})",
                )
            if threats:
                threat_flags = [t.to_dict() for t in threats]

        # Schema/content scan
        scan_result = scan_request(request.method, request.url.path, body_bytes)
        if scan_result and not scan_result.passed:
            blocked = True
            block_reason = f"scan_failed: {scan_result.reason}"
            BLOCKS_TOTAL.labels(reason="scan_failed").inc()
            return _block_response(400, scan_result.reason)

        # 5b. CoT Policy Enforcement (request path)
        if body_bytes and settings.cot_policy_enabled:
            try:
                import json as _json_cot
                from src.aletheia.extractors import detect_provider
                from src.aletheia.cot_enforcer import get_active_enforcer

                enforcer = get_active_enforcer()
                if enforcer:
                    provider = detect_provider(upstream.name)
                    try:
                        req_body = _json_cot.loads(body_bytes)
                    except (ValueError, UnicodeDecodeError):
                        req_body = None

                    if req_body and isinstance(req_body, dict):
                        model = req_body.get("model", "")
                        result = enforcer.evaluate(
                            provider=provider,
                            body=req_body,
                            model=model,
                            endpoint=path,
                            agent_id=auth_result.persona_id if auth_result else None,
                        )

                        if result.action == "reject":
                            blocked = True
                            block_reason = f"cot_policy: {result.reason}"
                            BLOCKS_TOTAL.labels(reason="cot_policy").inc()
                            return JSONResponse(
                                status_code=403,
                                content={
                                    "detail": "CoT policy violation: thinking/reasoning must be enabled",
                                    "policy": result.policy_name,
                                    "blocked_by": "soulgate",
                                },
                                headers={"X-Tiresias-Reason": "cot-policy-violation"},
                            )

                        if result.action == "inject" and result.modified_body:
                            body_bytes = _json_cot.dumps(result.modified_body).encode("utf-8")
                            cot_policy_injected = True

                        if result.action == "warn":
                            logger.warning(
                                "cot_policy.violation",
                                policy=result.policy_name,
                                agent_id=auth_result.persona_id if auth_result else None,
                                model=model,
                            )
            except Exception as e:
                logger.warning("cot_policy.evaluation_error", error=str(e))

        # 6. Forward to upstream
        upstream_url = _build_upstream_url(upstream, path)
        client = get_http_client()

        # Build forwarded headers
        headers = _forward_headers(request, auth_result)

        try:
            upstream_response = await client.request(
                method=request.method,
                url=upstream_url,
                content=body_bytes if body_bytes else None,
                headers=headers,
                timeout=upstream.timeout_ms / 1000.0,
            )
            response_status = upstream_response.status_code
            response_body = upstream_response.content
            response_size = len(response_body)

            # Record circuit breaker success
            if upstream.circuit_breaker_enabled:
                breaker = get_breaker(str(upstream.id))
                if 200 <= response_status < 500:
                    breaker.record_success()
                else:
                    breaker.record_failure()

            # === 6b. CoT Intercept (read-only, fire-and-forget) ===
            if response_body and response_status and 200 <= response_status < 300:
                try:
                    import json as _json
                    import uuid as _uuid
                    body_json = _json.loads(response_body)
                    from src.aletheia.extractors import extract_cot, detect_provider
                    provider = detect_provider(upstream.name)
                    extraction = extract_cot(provider, body_json)
                    if extraction and extraction.has_reasoning:
                        from src.aletheia.chain import CotChainWriter
                        writer = CotChainWriter(
                            _get_session_factory(), auth_result.tenant_id
                        )
                        req_id = _uuid.uuid4()
                        asyncio.create_task(
                            _safe_cot_append(writer, extraction, req_id, auth_result)
                        )
                except Exception:
                    logger.warning("cot_intercept.skipped", exc_info=True)

            # Build response
            response_headers = dict(upstream_response.headers)
            # Remove hop-by-hop headers
            for h in ("transfer-encoding", "connection", "keep-alive"):
                response_headers.pop(h, None)

            return Response(
                content=response_body,
                status_code=response_status,
                headers=response_headers,
            )

        except httpx.TimeoutException:
            if upstream.circuit_breaker_enabled:
                get_breaker(str(upstream.id)).record_failure()
            blocked = True
            block_reason = "upstream_timeout"
            BLOCKS_TOTAL.labels(reason="upstream_timeout").inc()
            return _block_response(504, f"Upstream {upstream.name} timed out")

        except httpx.ConnectError:
            if upstream.circuit_breaker_enabled:
                get_breaker(str(upstream.id)).record_failure()
            blocked = True
            block_reason = "upstream_unreachable"
            BLOCKS_TOTAL.labels(reason="upstream_unreachable").inc()
            return _block_response(502, f"Upstream {upstream.name} unreachable")

    finally:
        # 7. Audit log
        elapsed_ms = (time.monotonic() - start_time) * 1000.0
        REQUESTS_TOTAL.labels(
            method=request.method,
            upstream=upstream.name,
            status=response_status or 0,
            blocked=str(blocked).lower(),
        ).inc()
        REQUEST_DURATION.observe(elapsed_ms / 1000.0)

        await enqueue_log_entry(
            tenant_id=auth_result.tenant_id if auth_result else None,
            soulkey_id=auth_result.soulkey_id if auth_result else None,
            persona_id=auth_result.persona_id if auth_result else None,
            api_key_id=auth_result.api_key_id if auth_result else None,
            method=request.method,
            path=request.url.path,
            request_size_bytes=len(body_bytes) if 'body_bytes' in dir() else None,
            response_status=response_status,
            response_size_bytes=response_size,
            response_time_ms=elapsed_ms,
            upstream_name=upstream.name,
            blocked=blocked,
            block_reason=block_reason,
            threat_flags=threat_flags or None,
            source_ip=source_ip,
        )


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _build_upstream_url(upstream: SoulGateUpstream, path: str) -> str:
    """Build the full upstream URL."""
    base = upstream.base_url.rstrip("/")
    if path:
        return f"{base}/{path}"
    return base


def _forward_headers(request: Request, auth_result: AuthResult) -> dict[str, str]:
    """Build headers to forward to upstream, injecting identity context."""
    headers = {}
    # Forward safe headers
    safe_headers = {
        "content-type", "accept", "accept-encoding", "accept-language",
        "user-agent", "x-request-id", "x-correlation-id",
    }
    for key, value in request.headers.items():
        if key.lower() in safe_headers:
            headers[key] = value

    # Inject identity context
    if auth_result.tenant_id:
        headers["X-Tenant-ID"] = str(auth_result.tenant_id)
    if auth_result.soulkey_id:
        headers["X-SoulKey-ID"] = str(auth_result.soulkey_id)
    if auth_result.persona_id:
        headers["X-Persona-ID"] = auth_result.persona_id

    headers["X-Forwarded-By"] = "SoulGate/1.0"
    return headers


def _block_response(status_code: int, detail: str) -> JSONResponse:
    """Create a standardized block response."""
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "blocked_by": "soulgate"},
    )
