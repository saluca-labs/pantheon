"""
Prometheus metrics for SoulWatch.
"""

import re
import time

import structlog
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import APIRouter, Header, HTTPException, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response as StarletteResponse

logger = structlog.get_logger(__name__)

# --- Counters ---

ANOMALIES_TOTAL = Counter(
    "soulwatch_anomalies_total",
    "Total anomalies detected",
    ["type", "severity"],
)

DETECTIONS_TOTAL = Counter(
    "soulwatch_detections_total",
    "Total Sigma rule detections",
    ["rule_id", "level"],
)

EVENTS_PROCESSED_TOTAL = Counter(
    "soulwatch_events_processed_total",
    "Total events processed through the pipeline",
)

SIEM_FORWARD_TOTAL = Counter(
    "soulwatch_siem_forward_total",
    "Total events forwarded to SIEM destinations",
    ["destination"],
)

# --- Gauges ---

QUARANTINES_ACTIVE = Gauge(
    "soulwatch_quarantines_active",
    "Number of currently active quarantines",
)

SIEM_DLQ_SIZE = Gauge(
    "soulwatch_siem_dlq_size",
    "Number of events in the SIEM dead letter queue",
)

BASELINE_AGENTS_TRACKED = Gauge(
    "soulwatch_baseline_agents_tracked",
    "Number of agents with behavioral baselines",
)

HEALTH_CHECK_STATUS = Gauge(
    "soulwatch_health_check_status",
    "Health check status (1=healthy, 0=unhealthy)",
    ["component"],
)

# --- Histograms ---

PIPELINE_DURATION = Histogram(
    "soulwatch_pipeline_duration_seconds",
    "Event processing pipeline duration",
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

REQUEST_DURATION = Histogram(
    "soulwatch_request_duration_seconds",
    "HTTP request duration",
    ["method", "path_template", "status_code"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)


def _normalize_path(path: str) -> str:
    """Normalize path for metrics (replace UUIDs with :id)."""
    return re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        ":id",
        path,
    )


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


# --- Metrics endpoint ---

metrics_router = APIRouter(tags=["monitoring"])


@metrics_router.get("/metrics")
async def prometheus_metrics(
    authorization: str = Header(None),
    x_internal_key: str = Header(None, alias="X-Internal-Key"),
):
    """
    Prometheus-compatible metrics endpoint.
    Requires either a valid Bearer token or X-Internal-Key header matching
    SOULWATCH_INTERNAL_API_KEY. In debug mode, access is unrestricted.
    """
    from soulWatch.config.settings import get_settings
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

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
