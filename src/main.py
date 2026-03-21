"""
SoulAuth — FastAPI Application Entry Point.
Enterprise Agent Identity & Zero-Trust Authorization System.
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from config.settings import get_settings
from src.database.connection import init_db, close_db
from src.auth.router import router as auth_router
from src.admin.router import router as admin_router
from src.middleware.pep import SoulAuthPEPMiddleware
from src.middleware.tenant import TenantContextMiddleware
from src.middleware.feature_gate import FeatureGateMiddleware
from src.middleware.model_router import ModelRoutingMiddleware
from src.trial.router import router as trial_router, verify_router as trial_verify_router
from src.monitoring.metrics import metrics_router, MetricsMiddleware, start_gauge_updater, stop_gauge_updater
from src.analytics.router import router as analytics_router
from src.enforcement.router import router as enforcement_router
from src.analytics.baseline import BaselineEngine
from src.analytics.detector import AnomalyDetector
from src.analytics.alerts import AlertRouter, PrometheusAlertSink, TelegramAlertSink
from src.analytics._state import init_analytics
from src.detection.router import router as detection_router
from src.detection.sigma_engine import SigmaEngine
from src.detection.playbooks import PlaybookEngine
from src.detection._state import init_detection
from src.prh._state import init_prh
from src.prh.router import router as prh_router
from src.prh.middleware import PRHMiddleware

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
    """Application lifespan — startup and shutdown."""
    logger.info("soulauth.starting", version=settings.app_version)

    # Initialize database tables (dev mode)
    if settings.debug:
        await init_db()

    # --- License JWT Validation (Track B1) ---
    import os
    from src.license.validator import LicenseValidator, LicenseStatus

    license_key = os.environ.get("TIRESIAS_LICENSE_KEY", "") or settings.license_key
    validator = LicenseValidator(grace_hours=settings.license_grace_hours)
    license_token = validator.validate_with_grace(license_key)

    if license_token.status == LicenseStatus.INVALID and settings.license_required:
        logger.critical(
            "soulauth.license_invalid",
            message="License validation failed. Set a valid TIRESIAS_LICENSE_KEY or set SOULAUTH_LICENSE_REQUIRED=false.",
        )
        raise SystemExit(2)

    if license_token.status == LicenseStatus.MISSING and settings.license_required:
        logger.critical(
            "soulauth.license_missing",
            message="No license key provided. Set TIRESIAS_LICENSE_KEY or set SOULAUTH_LICENSE_REQUIRED=false.",
        )
        raise SystemExit(2)

    if license_token.is_valid:
        logger.info(
            "soulauth.license_loaded",
            tier=license_token.tier,
            is_nfr=license_token.is_nfr,
            status=license_token.status.value,
        )

    # --- License Relay (Track B3) ---
    # Non-NFR licenses phone home to verify/renew. Failure is non-fatal.
    if license_token.is_valid and not license_token.is_nfr:
        try:
            from src.license.relay import check_on_startup
            license_token = await check_on_startup(license_token)
        except Exception as e:
            logger.warning("soulauth.license_relay_failed", error=str(e))

    # Store license state for middleware access
    app.state.license = license_token

    # --- TIRESIAS_TIER override (TIER-02) ---
    # Allow deploy-time SKU selection without re-signing the license JWT.
    # TIRESIAS_TIER env var overrides the tier in the license token.
    _valid_tier_names = {"community", "starter", "pro", "enterprise", "mssp", "saas"}
    _tier_override = (settings.tiresias_tier or "").strip().lower()
    if _tier_override and _tier_override in _valid_tier_names:
        # Mutate the dataclass field directly -- LicenseToken is a plain dataclass
        import dataclasses as _dc
        app.state.license = _dc.replace(license_token, tier=_tier_override)
        logger.info(
            "soulauth.tier_override_applied",
            tier_from_license=license_token.tier,
            tier_override=_tier_override,
        )
    elif _tier_override and _tier_override not in _valid_tier_names:
        logger.warning(
            "soulauth.tier_override_invalid",
            tiresias_tier=_tier_override,
            valid_tiers=sorted(_valid_tier_names),
            message="TIRESIAS_TIER value is not a valid tier -- using license JWT tier.",
        )

    # Start background gauge updater
    try:
        start_gauge_updater(interval=60)
    except Exception as e:
        logger.warning("soulauth.gauge_updater_start_failed", error=str(e))

    # Start async policy sync if repo is configured
    if settings.policy_repo_path:
        try:
            from src.policy.git_sync import init_async_sync_manager
            sync_mgr = init_async_sync_manager(
                repo_path=settings.policy_repo_path,
                sync_interval=settings.policy_cache_ttl,
            )
            sync_mgr.start()
        except Exception as e:
            logger.warning("soulauth.policy_sync_start_failed", error=str(e))

    # Initialize anomaly detection and behavioral analytics
    try:
        from src.database.connection import async_session_factory
        baseline_engine = BaselineEngine(rebuild_interval_hours=6)
        detector = AnomalyDetector(baseline_engine=baseline_engine)
        alert_router_inst = AlertRouter()
        alert_router_inst.add_sink(PrometheusAlertSink())
        if settings.telegram_bot_token and settings.telegram_chat_id:
            alert_router_inst.add_sink(
                TelegramAlertSink(settings.telegram_bot_token, settings.telegram_chat_id),
                min_severity="critical",
            )
        init_analytics(baseline_engine, detector, alert_router_inst)
        baseline_engine.start_background_rebuild(async_session_factory)
        logger.info("soulauth.analytics_started")
    except Exception as e:
        logger.warning("soulauth.analytics_start_failed", error=str(e))

    # Initialize SIEM manager (v2 connector API)
    try:
        from src.siem._state import init_siem
        init_siem()
        logger.info("soulauth.siem_manager_started")
    except Exception as e:
        logger.warning("soulauth.siem_manager_start_failed", error=str(e))

        # Initialize Sigma detection engine and response playbooks
    if settings.detection_enabled:
        try:
            import os
            sigma_engine = SigmaEngine()
            playbook_engine_inst = PlaybookEngine()

            # Load rules from configured or default directory
            rules_dir = settings.detection_rules_dir or os.path.join(
                os.path.dirname(__file__), "detection", "rules"
            )
            if os.path.isdir(rules_dir):
                sigma_engine.load_rules(rules_dir)

            # Load playbooks from configured or default directory
            playbooks_dir = settings.detection_playbooks_dir or os.path.join(
                os.path.dirname(__file__), "detection", "playbooks"
            )
            if os.path.isdir(playbooks_dir):
                playbook_engine_inst.load_playbooks(playbooks_dir)

            init_detection(sigma_engine, playbook_engine_inst)
            logger.info(
                "soulauth.detection_started",
                rules=len(sigma_engine.list_rules()),
                playbooks=len(playbook_engine_inst.list_playbooks()),
            )
        except Exception as e:
            logger.warning("soulauth.detection_start_failed", error=str(e))

    # Initialize PRH engine
    try:
        init_prh()
        logger.info("soulauth.prh_started")
    except Exception as e:
        logger.warning("soulauth.prh_start_failed", error=str(e))

    # Start SIEM event forwarder if enabled
    if settings.siem_enabled:
        try:
            from src.integrations.forwarder import EventForwarder, set_event_forwarder
            from src.integrations.config import (
                SplunkConfig, ElasticConfig, SyslogConfig,
                WebhookConfig, AzureSentinelConfig,
            )
            import json as _json

            dest_configs = []
            if settings.siem_destinations:
                _type_map = {
                    "splunk": SplunkConfig,
                    "elastic": ElasticConfig,
                    "syslog": SyslogConfig,
                    "webhook": WebhookConfig,
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
            logger.info("soulauth.siem_forwarder_started", destinations=len(dest_configs))
        except Exception as e:
            logger.warning("soulauth.siem_forwarder_start_failed", error=str(e))

    yield

    # Shutdown
    logger.info("soulauth.shutting_down")

    # Stop analytics engine
    try:
        from src.analytics._state import get_baseline_engine
        be = get_baseline_engine()
        if be:
            be.stop_background_rebuild()
    except Exception:
        pass

    # Stop SIEM forwarder
    if settings.siem_enabled:
        try:
            from src.integrations.forwarder import get_event_forwarder, set_event_forwarder
            fwd = get_event_forwarder()
            if fwd:
                await fwd.stop()
                set_event_forwarder(None)
        except Exception as e:
            logger.warning("soulauth.siem_forwarder_stop_failed", error=str(e))

    stop_gauge_updater()

    if settings.policy_repo_path:
        try:
            from src.policy.git_sync import async_sync_manager
            if async_sync_manager:
                async_sync_manager.stop()
        except Exception:
            pass

    await close_db()


app = FastAPI(
    title="Tiresias API",
    version="1.0.0",
    # Disable OpenAPI/Swagger in production (FINDING-09)
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
    description=(
        "Tiresias - Enterprise Agent Identity & Zero-Trust Authorization Platform.\n\n"
        "Provides durable agent identity (SoulKeys), JIT policy evaluation (PDP), "
        "short-lived capability tokens, distributed policy enforcement (PEPs), "
        "behavioral anomaly detection, Sigma-based threat detection, automated "
        "quarantine enforcement, and SIEM integration.\n\n"
        "## Authentication\n\n"
        "Most endpoints require a SoulKey passed via the `X-SoulKey` header. "
        "Obtain a SoulKey by registering for a trial at `/v1/trial/register` "
        "or by requesting one from your tenant administrator.\n\n"
        "## Tiers\n\n"
        "- **Starter**: Identity resolution, PDP evaluation, trial registration\n"
        "- **Pro**: Analytics, detection rules, delegation, policy git-sync\n"
        "- **Enterprise**: Enforcement, SIEM forwarding, audit export, multi-tenant, custom detection\n\n"
        "## Resources\n\n"
        "- [Documentation](https://tiresias.saluca.com/docs)\n"
        "- [SDK (PyPI)](https://pypi.org/project/tiresias-sdk/)\n"
        "- [Support](mailto:support@saluca.com)\n"
    ),
    lifespan=lifespan,
    openapi_tags=[
        {
            "name": "Auth",
            "description": "Core authentication and authorization - identity resolution, PDP evaluation, and agent self-inspection.",
        },
        {
            "name": "Admin",
            "description": "Tenant management, SoulKey lifecycle (issue/suspend/revoke/rotate), policy sync, and audit reporting. Requires RBAC permissions.",
        },
        {
            "name": "Trial",
            "description": "Self-service trial registration and email verification. No authentication required for registration.",
        },
        {
            "name": "Detection",
            "description": "Sigma-based threat detection engine - rule management, playbook configuration, and match inspection.",
        },
        {
            "name": "Enforcement",
            "description": "Automated quarantine management - manual/automatic quarantine, release, and policy configuration.",
        },
        {
            "name": "Analytics",
            "description": "Behavioral analytics - anomaly detection, agent baselines, and dashboard summaries.",
        },
        {
            "name": "Health",
            "description": "Service health checks and Prometheus metrics. No authentication required.",
        },
    ],
)

# CORS middleware — production origins only; dev origins conditional on debug mode
_PRODUCTION_ORIGINS = [
    "https://tiresias.saluca.com",
    "https://www.tiresias.saluca.com",
]
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
]
_ALLOWED_ORIGINS = _PRODUCTION_ORIGINS + (_DEV_ORIGINS if settings.debug else [])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-SoulKey", "X-Tenant-ID", "X-Capability-Token", "X-Session-ID"],
)

# Feature gate middleware — enforces tier-based feature access (402)
# Model routing middleware — enforces per-persona model access policies
app.add_middleware(ModelRoutingMiddleware)

app.add_middleware(FeatureGateMiddleware)

# PEP middleware — validates capability tokens on protected endpoints
app.add_middleware(SoulAuthPEPMiddleware)

# Tenant context middleware — extracts tenant from requests
app.add_middleware(TenantContextMiddleware)

# Metrics middleware — request duration tracking
app.add_middleware(MetricsMiddleware)
app.add_middleware(PRHMiddleware)

# Register routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(trial_router)
app.include_router(trial_verify_router)
app.include_router(metrics_router)
app.include_router(analytics_router)
app.include_router(enforcement_router)
app.include_router(detection_router)
app.include_router(prh_router)
from src.siem.router import router as siem_router
app.include_router(siem_router)
from src.saas.router import router as saas_router
app.include_router(saas_router)


@app.get(
    "/health",
    tags=["Health"],
    summary="Service health check",
    responses={
        200: {
            "description": "Service is healthy",
            "content": {
                "application/json": {
                    "examples": {
                        "simple": {
                            "summary": "Simple health response",
                            "value": {"status": "healthy", "service": "soulauth", "version": "1.0.0"},
                        },
                        "detailed": {
                            "summary": "Detailed health response (?detail=true)",
                            "value": {
                                "status": "healthy",
                                "service": "soulauth",
                                "version": "1.0.0",
                                "components": {
                                    "database": {"status": "healthy", "latency_ms": 2.1},
                                    "jwt_keys": {"status": "healthy", "mode": "configured", "algorithm": "ES256"},
                                    "policy_sync": {"status": "healthy", "mode": "database_only"},
                                },
                            },
                        },
                    }
                }
            },
        },
        503: {
            "description": "Service is unhealthy - a critical component has failed",
            "content": {
                "application/json": {
                    "example": {
                        "status": "unhealthy",
                        "service": "soulauth",
                        "version": "1.0.0",
                        "components": {
                            "database": {"status": "unhealthy", "error": "connection refused"},
                        },
                    }
                }
            },
        },
    },
)
async def health_check(request: Request, detail: bool = Query(False, description="Return detailed component health")):
    """
    Service health check for load balancers, Kubernetes probes, and monitoring.

    By default returns a simple status response. Pass `?detail=true` for
    verbose component-level health information including database latency,
    JWT key status, and policy sync state.

    Returns HTTP 503 if any critical component (database, JWT keys) is unhealthy.
    """
    from src.monitoring.health import run_health_checks
    from src.middleware.feature_gate import get_enabled_features

    # Resolve active tier from app state (includes TIRESIAS_TIER override)
    license_state = getattr(request.app.state, "license", None)
    active_tier = license_state.tier if license_state else "community"
    enabled_features = get_enabled_features(active_tier)

    result = await run_health_checks(active_tier=active_tier, enabled_features=enabled_features)
    status_code = 503 if result["status"] == "unhealthy" else 200

    if not detail:
        # Simple mode: fast response for k8s probes and load balancers.
        # Includes tier info for portal conditional rendering (TIER-05).
        return JSONResponse(
            content={
                "status": result["status"],
                "service": "soulauth",
                "version": settings.app_version,
                "active_tier": active_tier,
                "enabled_features": enabled_features,
            },
            status_code=status_code,
        )

    # Detailed mode: full component breakdown
    return JSONResponse(content=result, status_code=status_code)


@app.get("/", tags=["Health"], summary="Service info and version")
async def root():
    """Root endpoint - returns service name, version, and documentation URL."""
    return {
        "service": "SoulAuth",
        "version": settings.app_version,
        "description": "Enterprise Agent Identity & Zero-Trust Authorization System",
        "docs": "/docs",
    }
