"""
SoulGate - API Security Gateway.
FastAPI application entry point.
Part of the Tiresias platform alongside SoulAuth and SoulWatch.
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from soulGate.config.settings import get_settings
from soulGate.src.database.connection import init_db, close_db, async_session_factory
from soulGate.src.proxy.upstream import load_upstreams
from soulGate.src.proxy.router import router as proxy_router
from soulGate.src.ratelimit.engine import load_rate_limit_policies
from soulGate.src.ratelimit.router import router as ratelimit_router
from soulGate.src.auth.router import router as apikey_router
from soulGate.src.access.router import router as access_router
from soulGate.src.circuit.router import router as circuit_router
from soulGate.src.audit.logger import start_audit_logger, stop_audit_logger
from soulGate.src.audit.router import router as audit_router
from soulGate.src.monitoring.metrics import metrics_router, MetricsMiddleware
from soulGate.src.proxy.gateway import close_http_client

settings = get_settings()

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if not settings.debug else structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}.get(
            settings.log_level.upper(), 20
        )
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    logger.info("soulgate.starting", version=settings.app_version, mode=settings.mode)

    # Initialize database tables
    await init_db()

    # Load upstream registry
    try:
        async with async_session_factory() as db:
            upstream_count = await load_upstreams(db)
        logger.info("soulgate.upstreams_loaded", count=upstream_count)
    except Exception as e:
        logger.warning("soulgate.upstream_load_failed", error=str(e))

    # Load rate limit policies
    try:
        async with async_session_factory() as db:
            policy_count = await load_rate_limit_policies(db)
        logger.info("soulgate.ratelimit_policies_loaded", count=policy_count)
    except Exception as e:
        logger.warning("soulgate.ratelimit_load_failed", error=str(e))

    # Start audit logger background task
    start_audit_logger(async_session_factory)

    logger.info("soulgate.started", mode=settings.mode, port=settings.port)

    yield

    # Shutdown
    logger.info("soulgate.shutting_down")

    # Stop audit logger
    await stop_audit_logger()

    # Close httpx client
    await close_http_client()

    # Close database
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API Security Gateway for the Tiresias platform. "
        "Provides reverse proxy with rate limiting, prompt injection detection, "
        "circuit breaking, IP/geo access control, API key management, and audit logging."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

# CORS middleware - restrict origins to known domains
_ALLOWED_ORIGINS = [
    "https://tiresias.saluca.com",
    "https://tiresias.network",
    "https://www.tiresias.network",
    "https://www.tiresias.saluca.com",
]
if settings.debug:
    _ALLOWED_ORIGINS += ["http://localhost:3000", "http://localhost:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-SoulKey", "X-Tenant-ID"],
)

# Metrics middleware
app.add_middleware(MetricsMiddleware)

# Register routers
app.include_router(proxy_router)
app.include_router(ratelimit_router)
app.include_router(apikey_router)
app.include_router(access_router)
app.include_router(circuit_router)
app.include_router(audit_router)
app.include_router(metrics_router)


@app.get("/health")
@app.get("/gate/health")
async def health_check(detail: bool = Query(False)):
    """Health check endpoint."""
    from soulGate.src.monitoring.health import run_health_checks
    result = await run_health_checks()
    status_code = 503 if result["status"] == "unhealthy" else 200

    if not detail:
        return JSONResponse(
            content={
                "status": result["status"],
                "service": "soulgate",
                "version": settings.app_version,
                "mode": settings.mode,
            },
            status_code=status_code,
        )

    return JSONResponse(content=result, status_code=status_code)


@app.get("/")
async def root():
    """Root endpoint - service info."""
    info = {
        "service": "SoulGate",
        "version": settings.app_version,
        "description": "API Security Gateway - Tiresias Platform",
        "mode": settings.mode,
    }
    if settings.debug:
        info["docs"] = "/docs"
    return info


@app.get("/healthz")
@app.get("/gate/healthz")
async def liveness():
    """Liveness probe — always 200 if the process is running."""
    return {"status": "alive", "service": "soulgate"}


@app.get("/readyz")
@app.get("/gate/readyz")
async def readiness():
    """Readiness probe — checks DB connectivity only (no cross-service deps)."""
    try:
        async with async_session_factory() as db:
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
        return JSONResponse(content={"status": "ready", "service": "soulgate"}, status_code=200)
    except Exception as e:
        return JSONResponse(content={"status": "not_ready", "error": str(e)}, status_code=503)
