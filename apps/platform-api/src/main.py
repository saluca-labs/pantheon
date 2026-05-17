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
from src.waitlist.router import router as waitlist_router
from src.monitoring.metrics import metrics_router, MetricsMiddleware, start_gauge_updater, stop_gauge_updater
from src.analytics.router import router as analytics_router
from src.enforcement.router import router as enforcement_router
from src.analytics.baseline import BaselineEngine
from src.analytics.detector import AnomalyDetector
from src.analytics.alerts import AlertRouter, PrometheusAlertSink, TelegramAlertSink
from src.analytics._state import init_analytics
from src.detection.router import router as detection_router
from src.auth.oidc_router import router as oidc_router
from src.detection.sigma_engine import SigmaEngine
from src.auth.local_router import router as local_auth_router
from src.auth.local_bootstrap import bootstrap_local_admin
from src.auth.ldap_router import router as ldap_auth_router
from src.auth.mfa_router import router as mfa_router
from src.detection.playbooks import PlaybookEngine
from src.detection._state import init_detection
from src.middleware.usage_limit import UsageLimitMiddleware
from src.billing.router import router as billing_router
from src.investigation.router import router as investigation_router
from src.saas.router import router as saas_router
from src.saas.master import router as saas_master_router
from src.partner.router import router as partner_router
from src.partner.setup import register_partner_program
from src.contracts.router import router as contracts_router
from src.siem.router import router as siem_router
from src.idp.router import router as idp_router
from src.notifications.router import router as notifications_router
from src.usage.router import router as usage_router
from src.teams.router import router as teams_router
from src.aletheia.router import router as aletheia_cot_router
from src.aletheia.sanitize_router import router as aletheia_sanitize_router
from src.aletheia.tool_evaluate_router import router as aletheia_tool_evaluate_router
from src.keys.router import router as keys_router
from src.mssp.router import router as mssp_router
from src.prh.router import router as prh_router
from src.tenant.router import router as tenant_router
from src.support.router import router as support_router
from src.chatbot.router import router as chatbot_router
from src.agents.router import router as agents_store_router
from src.agents.crud_router import router as agents_crud_router
from src.platform import init_memory_client, shutdown_memory_client
from src.platform.identity_router import router as platform_identity_router
from src.platform.health_router import router as platform_health_router
from src.platform.auth_router import router as platform_auth_router
from src.matrix_ingest.router import router as matrix_ingest_router

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

    # Initialize database tables (creates tables if they don't exist)
    await init_db()
    # Bootstrap local admin user if configured
    from src.database.connection import async_session_factory
    try:
        async with async_session_factory() as bootstrap_db:
            await bootstrap_local_admin(bootstrap_db)
    except Exception as e:
        logger.warning("local_auth.bootstrap_failed", error=str(e))

    # --- License JWT Validation (Track B1) ---
    import os
    import hashlib
    from src.license.validator import LicenseValidator, LicenseStatus, LicenseToken
    from src.license.issuer import get_active_license

    license_key = os.environ.get("TIRESIAS_LICENSE_KEY", "") or settings.license_key
    validator = LicenseValidator(grace_hours=settings.license_grace_hours)

    # Primary: validate from env var / settings
    license_token = validator.validate_with_grace(license_key)

    # Fallback: if no env var license, check DB for an active install-level license
    if license_token.status == LicenseStatus.MISSING:
        try:
            async with async_session_factory() as license_db:
                db_license = await get_active_license(license_db, tenant_id=None)
                if db_license and db_license.jwt_claims:
                    import json, time as _time
                    # Reconstruct and validate the stored JWT claims
                    stored_claims = db_license.jwt_claims
                    if stored_claims.get("exp", 0) > _time.time():
                        license_token = LicenseToken(
                            status=LicenseStatus.VALID,
                            tier=stored_claims.get("tier", "community"),
                            features=stored_claims.get("features", []),
                            is_nfr=stored_claims.get("is_nfr", False),
                            partner_id=stored_claims.get("partner_id"),
                            tenant_id=stored_claims.get("sub"),
                            issued_at=stored_claims.get("iat"),
                            expires_at=stored_claims.get("exp"),
                            raw_claims=stored_claims,
                        )
                        logger.info(
                            "soulauth.license_loaded_from_db",
                            tier=license_token.tier,
                            license_id=str(db_license.id),
                        )
        except Exception as e:
            logger.warning("soulauth.license_db_fallback_failed", error=str(e))

    if license_token.status == LicenseStatus.INVALID and settings.license_required:
        logger.critical(
            "soulauth.license_invalid",
            message="License validation failed. Set a valid TIRESIAS_LICENSE_KEY or set SOULAUTH_LICENSE_REQUIRED=false.",
        )
        raise SystemExit(2)

    if license_token.status == LicenseStatus.MISSING and settings.license_required:
        logger.critical(
            "soulauth.license_missing",
            message="No license key provided. Set TIRESIAS_LICENSE_KEY, issue via admin API, or set SOULAUTH_LICENSE_REQUIRED=false.",
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

    # Store startup tier fingerprint for tamper detection (T2.3)
    app.state.license_tier_at_startup = license_token.tier if license_token.is_valid else None
    app.state.license_env_hash = hashlib.sha256(
        (os.environ.get("TIRESIAS_LICENSE_KEY", "") + os.environ.get("TIRESIAS_TIER", "")).encode()
    ).hexdigest() if license_token.is_valid else None

    # Start license integrity watchdog (T2.3)
    # Config: WATCHDOG_INTERVAL_SECONDS (default: 300)
    from src.license.watchdog import start_watchdog, stop_watchdog
    _watchdog_interval = int(os.environ.get("WATCHDOG_INTERVAL_SECONDS", "300"))
    start_watchdog(app, interval_seconds=_watchdog_interval)

    # Start config integrity watchdog (T5.1)
    # Config: CONFIG_WATCHDOG_INTERVAL_SECONDS (default: 60), APP_ROOT (default: /app)
    from src.security.config_watchdog import start_config_watchdog, stop_config_watchdog
    _config_interval = int(os.environ.get("CONFIG_WATCHDOG_INTERVAL_SECONDS", "60"))
    _app_root = os.environ.get("APP_ROOT", "/app")
    start_config_watchdog(app_root=_app_root, interval_seconds=_config_interval)

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
        # DB-backed notification channels (Slack, PagerDuty, Teams, etc.)
        try:
            from src.notifications.sink import ChannelNotificationSink
            channel_sink = ChannelNotificationSink(async_session_factory)
            alert_router_inst.add_sink(channel_sink, min_severity="low")
            logger.info("soulauth.channel_notifications_enabled")
        except Exception as e:
            logger.warning("soulauth.channel_notifications_failed", error=str(e))
        init_analytics(baseline_engine, detector, alert_router_inst)
        baseline_engine.start_background_rebuild(async_session_factory)
        logger.info("soulauth.analytics_started")
    except Exception as e:
        logger.warning("soulauth.analytics_start_failed", error=str(e))

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

    # Load DB-configured SIEM connectors into the in-memory SIEMManager
    try:
        from src.siem._state import get_siem_manager, init_siem
        from src.siem.router import _row_to_config
        from src.database.models import SIEMConnector
        from sqlalchemy import select as _select

        init_siem()
        async with async_session_factory() as siem_db:
            rows = (await siem_db.execute(_select(SIEMConnector))).scalars().all()
            mgr = get_siem_manager()
            for row in rows:
                if row.enabled:
                    mgr.add_connector(_row_to_config(row))
            if rows:
                logger.info("soulauth.siem_connectors_loaded", count=len(rows))
    except Exception as e:
        logger.warning("soulauth.siem_connectors_load_failed", error=str(e))

    # Start grace period enforcement sweep (hourly)
    import asyncio
    _grace_task = None

    async def _grace_sweep_loop():
        """Periodically downgrade tenants whose grace period has expired."""
        from src.billing.grace import run_grace_period_check
        while True:
            try:
                async with async_session_factory() as sweep_db:
                    downgraded = await run_grace_period_check(sweep_db)
                    if downgraded:
                        logger.info("billing.grace_sweep_complete", downgraded=len(downgraded))
            except Exception as e:
                logger.warning("billing.grace_sweep_failed", error=str(e))
            await asyncio.sleep(3600)  # 1 hour

    try:
        _grace_task = asyncio.create_task(_grace_sweep_loop())
        logger.info("billing.grace_sweep_started")
    except Exception as e:
        logger.warning("billing.grace_sweep_start_failed", error=str(e))

    # Initialise shared MemoryClient (platform-v2 unification).
    # Failure is non-fatal: endpoints depending on memory will return 503
    # individually; routes that don't touch memory keep working.
    try:
        await init_memory_client(app)
        logger.info("platform.memory_client_started")
    except Exception as e:
        logger.warning("platform.memory_client_start_failed", error=str(e))

    yield

    # Shutdown
    logger.info("soulauth.shutting_down")

    # Cancel grace sweep
    if _grace_task and not _grace_task.done():
        _grace_task.cancel()

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
    stop_watchdog()
    stop_config_watchdog()

    if settings.policy_repo_path:
        try:
            from src.policy.git_sync import async_sync_manager
            if async_sync_manager:
                async_sync_manager.stop()
        except Exception:
            pass

    # Close MemoryClient httpx pool
    try:
        await shutdown_memory_client(app)
    except Exception as e:
        logger.warning("platform.memory_client_stop_failed", error=str(e))

    await close_db()


app = FastAPI(
    title="Tiresias API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
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
        "- [Documentation](https://tiresias.network/docs)\n"
        "- [SDK (PyPI)](https://pypi.org/project/tiresias-sdk/)\n"
        f"- [Support](mailto:{settings.support_email})\n"
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
    "https://tiresias.network",
    "https://www.tiresias.network",
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

# Usage limit middleware — enforces tier request quotas (429 at 110%+)
app.add_middleware(UsageLimitMiddleware)

# PEP middleware — validates capability tokens on protected endpoints
app.add_middleware(SoulAuthPEPMiddleware)

# Tenant context middleware — extracts tenant from requests
app.add_middleware(TenantContextMiddleware)

# Metrics middleware — request duration tracking
app.add_middleware(MetricsMiddleware)

# Register routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(trial_router)
app.include_router(trial_verify_router)
app.include_router(waitlist_router)
app.include_router(metrics_router)
app.include_router(analytics_router)
app.include_router(enforcement_router)
app.include_router(detection_router)
app.include_router(oidc_router)
app.include_router(local_auth_router)
app.include_router(ldap_auth_router)
app.include_router(mfa_router)
app.include_router(billing_router)
app.include_router(investigation_router)
app.include_router(saas_router)
app.include_router(saas_master_router)
app.include_router(partner_router)
register_partner_program(app)
app.include_router(contracts_router)
app.include_router(siem_router)
app.include_router(matrix_ingest_router)
app.include_router(idp_router)
app.include_router(notifications_router)
app.include_router(usage_router)
app.include_router(teams_router)
app.include_router(aletheia_cot_router)
app.include_router(aletheia_sanitize_router)
app.include_router(aletheia_tool_evaluate_router)
app.include_router(keys_router)
app.include_router(mssp_router)
app.include_router(prh_router)
app.include_router(tenant_router)
app.include_router(support_router)
app.include_router(chatbot_router)

# Wave H.2.b — Agents-store configuration (LocalPg ↔ Supabase adapter)
app.include_router(agents_store_router)

# Wave H.2.c — Agent + Prompt CRUD (/v1/agents/*, /v1/prompts/*)
app.include_router(agents_crud_router)

# Portal policy management API (Phase 3 — SaaS two-tier)
from src.portal.policy_router import router as portal_policy_router
app.include_router(portal_policy_router)

# Platform v2 unification routers — BFF identity echo + aggregated readiness
app.include_router(platform_identity_router)
app.include_router(platform_health_router)
app.include_router(platform_auth_router)


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
async def health_check(detail: bool = Query(False, description="Return detailed component health")):
    """
    Service health check for load balancers, Kubernetes probes, and monitoring.

    By default returns a simple status response. Pass `?detail=true` for
    verbose component-level health information including database latency,
    JWT key status, and policy sync state.

    Returns HTTP 503 if any critical component (database, JWT keys) is unhealthy.
    """
    from src.monitoring.health import run_health_checks
    result = await run_health_checks()
    status_code = 503 if result["status"] == "unhealthy" else 200

    if not detail:
        # Simple mode: fast response for k8s probes and load balancers.
        return JSONResponse(
            content={
                "status": result["status"],
                "service": "soulauth",
                "version": settings.app_version,
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


# ── Local-auth-aware liveness / readiness probes ──────────────────────────────
@app.get("/health/live", tags=["Health"], summary="Liveness probe")
async def health_live():
    """Liveness probe — returns 200 when the process is alive."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["Health"], summary="Readiness probe")
async def health_ready():
    """Readiness probe — returns 200 when the DB is reachable."""
    from src.monitoring.health import run_health_checks
    result = await run_health_checks()
    if result.get("status") != "healthy":
        from fastapi.responses import JSONResponse
        return JSONResponse({"status": "not_ready"}, status_code=503)
    return {"status": "ready"}
