"""
SoulWatch - AI Runtime Security Monitoring.
FastAPI application entry point.
Part of the Tiresias platform alongside SoulAuth.
"""

import os

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from soulWatch.config.settings import get_settings
from soulWatch.src.database.connection import init_db, close_db, async_session_factory
from soulWatch.src.analytics.baseline import BaselineEngine
from soulWatch.src.analytics.detector import AnomalyDetector
from soulWatch.src.analytics.alerts import AlertRouter, PrometheusAlertSink, TelegramAlertSink
from soulWatch.src.analytics._state import init_analytics
from soulWatch.src.analytics.router import router as analytics_router
from soulWatch.src.detection.sigma_engine import SigmaEngine
from soulWatch.src.detection.playbooks import PlaybookEngine
from soulWatch.src.detection._state import init_detection
from soulWatch.src.detection.router import router as detection_router
from soulWatch.src.enforcement.quarantine import QuarantineEngine
from soulWatch.src.enforcement.router import router as enforcement_router, set_quarantine_engine
from soulWatch.src.integrations.router import router as integrations_router
from soulWatch.src.dashboard.router import router as dashboard_router
from soulWatch.src.reports.router import router as reports_router
from soulWatch.src.websocket.live import router as ws_router, init_ws_manager
from soulWatch.src.monitoring.metrics import metrics_router, MetricsMiddleware
from soulWatch.src.aletheia.router import router as aletheia_router
from soulWatch.src.pipeline.processor import set_quarantine_engine as set_pipeline_quarantine, set_ws_manager

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
    logger.info("soulwatch.starting", version=settings.app_version, mode=settings.mode)

    # Initialize database tables
    await init_db()

    # Initialize baseline engine and anomaly detector
    baseline_engine = BaselineEngine(
        rebuild_interval_hours=settings.baseline_rebuild_interval_hours,
        lookback_hours=settings.baseline_lookback_hours,
    )
    detector = AnomalyDetector(baseline_engine=baseline_engine)

    # Initialize alert router
    alert_router_inst = AlertRouter()
    alert_router_inst.add_sink(PrometheusAlertSink())
    if settings.telegram_bot_token and settings.telegram_chat_id:
        alert_router_inst.add_sink(
            TelegramAlertSink(settings.telegram_bot_token, settings.telegram_chat_id),
            min_severity="critical",
        )

    init_analytics(baseline_engine, detector, alert_router_inst)

    # Load baselines from DB
    try:
        async with async_session_factory() as db:
            loaded = await baseline_engine.load_from_db(db)
            await db.commit()
        logger.info("soulwatch.baselines_loaded", count=loaded)
    except Exception as e:
        logger.warning("soulwatch.baseline_load_failed", error=str(e))

    # Start background baseline rebuild
    baseline_engine.start_background_rebuild(async_session_factory)

    # Initialize Sigma detection engine and playbooks
    if settings.detection_enabled:
        try:
            sigma_engine = SigmaEngine()
            playbook_engine_inst = PlaybookEngine()

            rules_dir = settings.detection_rules_dir or os.path.join(
                os.path.dirname(__file__), "src", "detection", "rules"
            )
            if os.path.isdir(rules_dir):
                sigma_engine.load_rules(rules_dir)

            playbooks_dir = settings.detection_playbooks_dir or os.path.join(
                os.path.dirname(__file__), "src", "detection", "playbooks"
            )
            if os.path.isdir(playbooks_dir):
                playbook_engine_inst.load_playbooks(playbooks_dir)

            # Load custom rules from DB
            try:
                from soulWatch.src.database.models import SoulWatchCustomRule
                from sqlalchemy import select
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(SoulWatchCustomRule).where(SoulWatchCustomRule.enabled == True)
                    )
                    custom_rules = result.scalars().all()
                    for cr in custom_rules:
                        try:
                            rule = sigma_engine.load_rule(cr.yaml_content)
                            rule.is_custom = True
                            sigma_engine.add_rule(rule)
                        except Exception as e:
                            logger.warning("soulwatch.custom_rule_load_failed", rule_id=cr.rule_id, error=str(e))
            except Exception as e:
                logger.warning("soulwatch.custom_rules_load_failed", error=str(e))

            init_detection(sigma_engine, playbook_engine_inst)
            logger.info(
                "soulwatch.detection_started",
                rules=len(sigma_engine.list_rules()),
                playbooks=len(playbook_engine_inst.list_playbooks()),
            )
        except Exception as e:
            logger.warning("soulwatch.detection_start_failed", error=str(e))

    # Initialize quarantine engine
    quarantine_engine = QuarantineEngine()
    set_quarantine_engine(quarantine_engine)
    set_pipeline_quarantine(quarantine_engine)

    # Initialize WebSocket manager
    ws_manager = init_ws_manager(max_connections=settings.ws_max_connections)
    set_ws_manager(ws_manager)

    # Start SIEM forwarder if enabled
    if settings.siem_enabled:
        try:
            from soulWatch.src.integrations.forwarder import EventForwarder, set_event_forwarder
            from soulWatch.src.integrations.config import (
                SplunkConfig, ElasticConfig, SyslogConfig,
                WebhookConfig, AzureSentinelConfig,
            )
            import json as _json

            dest_configs = []
            if settings.siem_destinations:
                _type_map = {
                    "splunk": SplunkConfig, "elastic": ElasticConfig,
                    "syslog": SyslogConfig, "webhook": WebhookConfig,
                    "azure_sentinel": AzureSentinelConfig,
                }
                for raw in _json.loads(settings.siem_destinations):
                    cfg_cls = _type_map.get(raw.get("type"))
                    if cfg_cls:
                        dest_configs.append(cfg_cls(**raw))

            forwarder = EventForwarder(
                destinations=dest_configs,
                buffer_size=settings.siem_buffer_size,
                flush_interval=settings.siem_flush_interval,
            )
            forwarder.start()
            set_event_forwarder(forwarder)
            logger.info("soulwatch.siem_forwarder_started", destinations=len(dest_configs))
        except Exception as e:
            logger.warning("soulwatch.siem_forwarder_start_failed", error=str(e))

    # Start event pipeline (sidecar mode: audit table poller)
    poller = None
    if settings.mode == "sidecar":
        try:
            from soulWatch.src.pipeline.ingestion import AuditTablePoller
            poller = AuditTablePoller(
                session_factory=async_session_factory,
                poll_interval=settings.poll_interval_seconds,
                batch_size=settings.pipeline_batch_size,
            )
            poller.start()
            logger.info("soulwatch.poller_started", interval=settings.poll_interval_seconds)
        except Exception as e:
            logger.warning("soulwatch.poller_start_failed", error=str(e))

    logger.info("soulwatch.started", mode=settings.mode)

    yield

    # Shutdown
    logger.info("soulwatch.shutting_down")

    # Stop poller
    if poller:
        await poller.stop()

    # Stop baseline rebuild
    baseline_engine.stop_background_rebuild()

    # Stop SIEM forwarder
    if settings.siem_enabled:
        try:
            from soulWatch.src.integrations.forwarder import get_event_forwarder, set_event_forwarder
            fwd = get_event_forwarder()
            if fwd:
                await fwd.stop()
                set_event_forwarder(None)
        except Exception:
            pass

    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI Runtime Security Monitoring for the Tiresias platform. "
        "Provides behavioral anomaly detection, Sigma-based rule evaluation, "
        "automated quarantine response, SIEM integration, and compliance reporting."
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
app.include_router(analytics_router)
app.include_router(detection_router)
app.include_router(enforcement_router)
app.include_router(integrations_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(ws_router)
app.include_router(metrics_router)
app.include_router(aletheia_router)


# Standalone mode: event ingestion endpoint
@app.post("/watch/v1/events")
async def ingest_event(
    event: dict,
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
):
    """
    Standalone mode: receive an audit event for processing.
    In sidecar mode, events are polled from the audit table instead.
    Requires X-Internal-Key header matching SOULWATCH_INTERNAL_API_KEY.
    """
    expected_key = settings.internal_api_key
    if not expected_key or x_internal_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid or missing internal API key")

    from soulWatch.src.database.connection import get_db, async_session_factory
    from soulWatch.src.pipeline.processor import process_event

    async with async_session_factory() as db:
        try:
            result = await process_event(event, db)
            await db.commit()
            return {"status": "processed", "result": result}
        except Exception as e:
            await db.rollback()
            return JSONResponse(
                status_code=500,
                content={"status": "error", "detail": str(e)},
            )


@app.get("/health")
@app.get("/watch/health")
async def health_check(detail: bool = Query(False)):
    """Health check endpoint."""
    from soulWatch.src.monitoring.health import run_health_checks
    result = await run_health_checks()
    status_code = 503 if result["status"] == "unhealthy" else 200

    if not detail:
        return JSONResponse(
            content={
                "status": result["status"],
                "service": "soulwatch",
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
        "service": "SoulWatch",
        "version": settings.app_version,
        "description": "AI Runtime Security Monitoring - Tiresias Platform",
        "mode": settings.mode,
    }
    if settings.debug:
        info["docs"] = "/docs"
    return info


@app.get("/healthz")
@app.get("/watch/healthz")
async def liveness():
    """Liveness probe — always 200 if the process is running."""
    return {"status": "alive", "service": "soulwatch"}


@app.get("/readyz")
@app.get("/watch/readyz")
async def readiness():
    """Readiness probe — checks DB connectivity only (no cross-service deps)."""
    try:
        async with async_session_factory() as db:
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
        return JSONResponse(content={"status": "ready", "service": "soulwatch"}, status_code=200)
    except Exception as e:
        return JSONResponse(content={"status": "not_ready", "error": str(e)}, status_code=503)
