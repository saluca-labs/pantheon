"""
Prometheus metrics and observability.
Implements monitoring requirements from ARCHITECTURE.md.
"""

import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Optional

import structlog
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import APIRouter, Response, Request as FastAPIRequest
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response as StarletteResponse

logger = structlog.get_logger(__name__)

# --- Counters ---

AUTH_REQUESTS_TOTAL = Counter(
    "soulauth_auth_requests_total",
    "Total auth evaluation requests",
    ["decision", "resource", "tenant_id"],
)

KEY_OPERATIONS_TOTAL = Counter(
    "soulauth_key_operations_total",
    "Total key lifecycle operations",
    ["operation"],  # issued, suspended, revoked, reinstated, rotated
)

TOKEN_OPERATIONS_TOTAL = Counter(
    "soulauth_token_operations_total",
    "Total capability token operations",
    ["operation"],  # issued, validated, expired, revoked
)

TOKEN_MINTING_FAILURES = Counter(
    "soulauth_token_minting_failures_total",
    "Total token minting failures",
    ["reason"],
)

POLICY_SYNCS_TOTAL = Counter(
    "soulauth_policy_syncs_total",
    "Total policy sync operations",
    ["status"],  # success, failed, validation_error
)

PEP_DECISIONS_TOTAL = Counter(
    "soulauth_pep_decisions_total",
    "PEP enforcement decisions",
    ["decision"],  # allowed, denied, error
)

RATE_LIMIT_HITS = Counter(
    "soulauth_rate_limit_hits_total",
    "Total rate limit enforcement events",
    ["endpoint", "tenant_id"],
)

RATE_LIMIT_REJECTIONS = Counter(
    "soulauth_rate_limit_rejections_total",
    "Total requests rejected by rate limiting",
    ["endpoint", "tenant_id"],
)

# --- Histograms ---

AUTH_EVALUATION_DURATION = Histogram(
    "soulauth_auth_evaluation_duration_seconds",
    "PDP evaluation duration",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

REQUEST_DURATION = Histogram(
    "soulauth_request_duration_seconds",
    "HTTP request duration",
    ["method", "path_template", "status_code"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

TOKEN_VALIDATION_DURATION = Histogram(
    "soulauth_token_validation_duration_seconds",
    "Capability token validation duration",
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
)

# --- Gauges ---

ACTIVE_TENANTS = Gauge(
    "soulauth_active_tenants",
    "Number of active tenants",
)

ACTIVE_SOULKEYS = Gauge(
    "soulauth_active_soulkeys",
    "Number of active soulkeys",
)

ACTIVE_TRIALS = Gauge(
    "soulauth_active_trials",
    "Number of active trials",
)

POLICY_SYNC_LAST_SUCCESS = Gauge(
    "soulauth_policy_sync_last_success_timestamp",
    "Unix timestamp of the last successful policy sync",
)

SIDECAR_CONNECTED_CLAWS = Gauge(
    "soulauth_sidecar_connected_claws",
    "Number of PEP sidecar (claw) instances currently connected",
)

HEALTH_CHECK_STATUS = Gauge(
    "soulauth_health_check_status",
    "Health check status (1=healthy, 0=unhealthy)",
    ["component"],
)

# --- Anomaly detection metrics ---

ANOMALIES_TOTAL = Counter(
    "soulauth_anomalies_total",
    "Total anomalies detected",
    ["type", "severity"],
)

ANOMALY_DETECTION_DURATION = Histogram(
    "soulauth_anomaly_detection_duration_seconds",
    "Duration of anomaly detection checks",
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
)

BASELINE_AGENTS_TRACKED = Gauge(
    "soulauth_baseline_agents_tracked",
    "Number of agents with behavioral baselines",
)


def _normalize_path(path: str) -> str:
    """Normalize path for metrics (replace UUIDs with :id)."""
    import re
    # Replace UUIDs
    path = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        ":id",
        path,
    )
    return path


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect request duration metrics."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> StarletteResponse:
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        path = _normalize_path(request.url.path)
        REQUEST_DURATION.labels(
            method=request.method,
            path_template=path,
            status_code=response.status_code,
        ).observe(duration)

        return response


# --- Background gauge updater ---

_gauge_update_task: Optional[asyncio.Task] = None


async def _update_gauges_loop(interval: int = 60):
    """Periodically query the database to update gauge metrics."""
    from src.database.connection import async_session_factory
    from sqlalchemy import text

    while True:
        try:
            async with async_session_factory() as session:
                # Active tenants
                result = await session.execute(
                    text("SELECT COUNT(*) FROM _soul_tenants WHERE status = 'active'")
                )
                count = result.scalar() or 0
                ACTIVE_TENANTS.set(count)

                # Active soulkeys
                result = await session.execute(
                    text("SELECT COUNT(*) FROM _soulkeys WHERE status = 'active'")
                )
                count = result.scalar() or 0
                ACTIVE_SOULKEYS.set(count)

                # Active trials
                result = await session.execute(
                    text("SELECT COUNT(*) FROM _soulauth_trials WHERE status = 'active'")
                )
                count = result.scalar() or 0
                ACTIVE_TRIALS.set(count)

            logger.debug("metrics.gauges_updated")
        except Exception as e:
            logger.warning("metrics.gauge_update_failed", error=str(e))

        await asyncio.sleep(interval)


def start_gauge_updater(interval: int = 60):
    """Start the background gauge updater task. Call during app startup."""
    global _gauge_update_task
    if _gauge_update_task is None or _gauge_update_task.done():
        _gauge_update_task = asyncio.create_task(_update_gauges_loop(interval))
        logger.info("metrics.gauge_updater_started", interval=interval)


def stop_gauge_updater():
    """Stop the background gauge updater task. Call during app shutdown."""
    global _gauge_update_task
    if _gauge_update_task and not _gauge_update_task.done():
        _gauge_update_task.cancel()
        _gauge_update_task = None
        logger.info("metrics.gauge_updater_stopped")


# --- Metrics endpoint ---

metrics_router = APIRouter(tags=["Health"])


def _check_metrics_auth(request: FastAPIRequest) -> Optional[JSONResponse]:
    """
    Validate bearer token for /metrics if METRICS_AUTH_TOKEN is configured.
    Returns None if access is allowed, or a 401/403 JSONResponse if denied.
    In dev mode (no token set), access is open.
    """
    expected_token = os.environ.get("METRICS_AUTH_TOKEN")
    if not expected_token:
        # No token configured — allow open access (dev/local mode)
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or malformed Authorization header. Use: Bearer <token>"},
        )

    provided_token = auth_header[len("Bearer "):]
    # Constant-time comparison to prevent timing attacks
    import hmac
    if not hmac.compare_digest(provided_token, expected_token):
        return JSONResponse(
            status_code=403,
            content={"detail": "Invalid metrics auth token"},
        )

    return None


@metrics_router.get(
    "/metrics",
    summary="Prometheus metrics",
    responses={
        200: {
            "description": "Prometheus text-format metrics exposition",
            "content": {"text/plain": {"example": "# HELP soulauth_auth_requests_total Total auth evaluation requests\nsoulauth_auth_requests_total{decision=\"grant\"} 42.0"}},
        },
        401: {"description": "Missing or malformed Authorization header"},
        403: {"description": "Invalid metrics auth token"},
    },
)
async def prometheus_metrics(request: FastAPIRequest):
    """
    Prometheus-compatible metrics endpoint.

    Returns all collected metrics in Prometheus text exposition format.
    Includes counters for auth requests, key operations, token operations,
    policy syncs, PEP decisions, and rate limit events. Also includes
    histograms for request duration and gauges for active entities.

    If METRICS_AUTH_TOKEN is set, requires Authorization: Bearer <token>.
    """
    auth_error = _check_metrics_auth(request)
    if auth_error is not None:
        return auth_error

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
