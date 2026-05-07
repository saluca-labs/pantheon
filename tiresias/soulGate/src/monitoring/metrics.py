"""
Prometheus metrics for SoulGate.
8 metrics with soulgate_ prefix.
"""

import time

import structlog
from fastapi import APIRouter, Header, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response, PlainTextResponse
from prometheus_client import (
    Counter, Histogram, Gauge,
    generate_latest, CONTENT_TYPE_LATEST,
)

from soulGate.src.audit.logger import get_queue_size

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

REQUESTS_TOTAL = Counter(
    "soulgate_requests_total",
    "Total requests processed by SoulGate",
    ["method", "upstream", "status", "blocked"],
)

REQUEST_DURATION = Histogram(
    "soulgate_request_duration_seconds",
    "Request duration in seconds",
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

BLOCKS_TOTAL = Counter(
    "soulgate_blocks_total",
    "Total blocked requests by reason",
    ["reason"],
)

RATE_LIMIT_HITS = Counter(
    "soulgate_rate_limit_hits_total",
    "Total rate limit rejections",
)

CIRCUIT_STATE = Gauge(
    "soulgate_circuit_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
    ["upstream"],
)

UPSTREAM_HEALTH = Gauge(
    "soulgate_upstream_health",
    "Upstream health status (1=healthy, 0=unhealthy)",
    ["upstream"],
)

ACTIVE_API_KEYS = Gauge(
    "soulgate_active_api_keys",
    "Number of active API keys",
)

AUDIT_QUEUE_SIZE = Gauge(
    "soulgate_audit_queue_size",
    "Current audit log queue size",
)


# ---------------------------------------------------------------------------
# Metrics middleware
# ---------------------------------------------------------------------------

class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware that tracks overall HTTP request metrics."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip metrics endpoint itself to avoid recursion
        if request.url.path == "/gate/metrics":
            return await call_next(request)

        start = time.monotonic()
        response = await call_next(request)
        duration = time.monotonic() - start

        REQUEST_DURATION.observe(duration)

        # Update audit queue gauge
        AUDIT_QUEUE_SIZE.set(get_queue_size())

        return response


# ---------------------------------------------------------------------------
# Metrics endpoint
# ---------------------------------------------------------------------------

metrics_router = APIRouter(tags=["monitoring"])


@metrics_router.get("/gate/metrics")
async def prometheus_metrics(
    authorization: str = Header(None),
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """
    Prometheus metrics endpoint.
    Requires either a valid Bearer token or X-Internal-Key header matching
    SOULGATE_INTERNAL_API_KEY. In debug mode, access is unrestricted.
    """
    from soulGate.config.settings import get_settings
    _settings = get_settings()

    if not _settings.debug:
        expected_key = _settings.internal_api_key
        bearer_ok = (
            authorization
            and authorization.startswith("Bearer ")
            and expected_key
            and authorization[7:] == expected_key
        )
        internal_ok = expected_key and x_internal_key == expected_key

        if not (bearer_ok or internal_ok):
            raise HTTPException(status_code=401, detail="Authentication required for metrics endpoint")

    # Update circuit state gauges
    from soulGate.src.circuit.breaker import list_breakers
    state_map = {"closed": 0, "half_open": 1, "open": 2}
    for breaker in list_breakers():
        CIRCUIT_STATE.labels(upstream=breaker.upstream_id).set(
            state_map.get(breaker.state, 0)
        )

    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )
