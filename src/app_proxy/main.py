"""Tiresias App Proxy — FastAPI application entry point."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncEngine

from app_proxy.config import Settings

logger = structlog.stdlib.get_logger("app_proxy")

# ---------------------------------------------------------------------------
# Module-level state (set during lifespan)
# ---------------------------------------------------------------------------
_settings: Settings | None = None
_db_engine: AsyncEngine | None = None
_cedar_engine: object | None = None  # typed loosely until cedar module lands
_plugin_registry: object | None = None
_audit_logger: object | None = None
_approval_service: object | None = None
_approval_sweeper_task: object | None = None
_scheduler: object | None = None


def get_settings() -> Settings:
    """Return the loaded settings; raises if called before startup."""
    assert _settings is not None, "Settings not initialised — app not started?"
    return _settings


def get_db_engine() -> AsyncEngine:
    assert _db_engine is not None, "DB engine not initialised."
    return _db_engine


def get_cedar_engine() -> object:
    assert _cedar_engine is not None, "Cedar engine not initialised."
    return _cedar_engine


def get_plugin_registry() -> object:
    assert _plugin_registry is not None, "Plugin registry not initialised."
    return _plugin_registry


def get_audit_logger() -> object:
    assert _audit_logger is not None, "Audit logger not initialised."
    return _audit_logger


def get_approval_service() -> object:
    assert _approval_service is not None, "Approval service not initialised."
    return _approval_service


def get_scheduler() -> object:
    assert _scheduler is not None, "Scheduler not initialised."
    return _scheduler


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup / shutdown lifecycle for the App Proxy."""
    global _settings, _db_engine, _cedar_engine, _plugin_registry, _audit_logger, _approval_service, _approval_sweeper_task, _scheduler

    # ---- startup ----
    _settings = Settings()
    logger.info(
        "app_proxy.startup",
        tenant_id=str(_settings.tenant_id),
        port=_settings.proxy_port,
        enforcement=_settings.policy_enforcement_mode,
    )

    # Database
    from app_proxy.storage.engine import create_engine as _create_engine, create_tables
    import app_proxy.scheduler.models  # noqa: F401 — register ScheduledCallRecord with Base

    _db_engine = _create_engine(_settings.database_url)
    await create_tables(_db_engine)
    logger.info("db.engine.ready", url=_settings.database_url)

    # Audit logger (needs DB engine)
    from app_proxy.audit.logger import AuditLogger

    _audit_logger = AuditLogger(_db_engine)
    logger.info("audit.logger.ready")

    # Approval service (needs DB engine)
    from app_proxy.approval.service import ApprovalService
    from app_proxy.approval.sweeper import run_approval_sweeper

    _approval_service = ApprovalService(
        db_engine=_db_engine,
        notify_url=_settings.approval_notify_url,
    )
    _approval_sweeper_task = asyncio.create_task(
        run_approval_sweeper(
            _approval_service,
            interval_seconds=_settings.approval_sweeper_interval_seconds,
        )
    )
    logger.info("approval.service.ready")

    # Cedar policy engine
    from app_proxy.policy.engine import CedarPolicyEngine

    _cedar_engine = CedarPolicyEngine(
        policies_dir=_settings.policies_dir,
        schema_path=_settings.cedar_schema_path,
    )
    logger.info("cedar.engine.ready")

    # Plugin registry
    from app_proxy.plugins.registry import PluginRegistry

    _plugin_registry = PluginRegistry(_settings.plugins_dir)
    await _plugin_registry.load()
    logger.info("plugin.registry.ready", plugins=len(_plugin_registry.list_tools()))

    # Scheduler engine (needs cedar, registry, audit, DB)
    from app_proxy.scheduler.engine import SchedulerEngine

    _scheduler = SchedulerEngine(
        db_engine=_db_engine,
        cedar_engine=_cedar_engine,
        plugin_registry=_plugin_registry,
        audit_logger=_audit_logger,
    )
    await _scheduler.start()
    logger.info("scheduler.engine.ready")

    yield

    # ---- shutdown ----
    logger.info("app_proxy.shutdown")

    # Cancel approval sweeper
    if _approval_sweeper_task is not None:
        _approval_sweeper_task.cancel()
        try:
            await _approval_sweeper_task
        except asyncio.CancelledError:
            pass
        logger.info("approval.sweeper.cancelled")

    # Stop scheduler
    if _scheduler is not None and hasattr(_scheduler, 'shutdown'):
        await _scheduler.shutdown()
        logger.info("scheduler.engine.closed")

    # Close plugin processes
    if _plugin_registry is not None and hasattr(_plugin_registry, 'close'):
        _plugin_registry.close()

    # Close DB engine
    if _db_engine is not None:
        await _db_engine.dispose()
        logger.info("db.engine.closed")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Tiresias App Proxy",
    version="0.1.0",
    description="Governs AI agent actions via MCP plugin dispatch and Cedar policy evaluation.",
    lifespan=lifespan,
)

# CORS — allow dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    settings = get_settings()
    plugin_count = len(_plugin_registry.list_tools()) if _plugin_registry and hasattr(_plugin_registry, 'list_tools') else 0
    return {
        "status": "ok",
        "plugins": plugin_count,
        "policy_enforcement": settings.policy_enforcement_mode,
    }


# ---------------------------------------------------------------------------
# Routers (imported lazily so missing files don't block startup)
# ---------------------------------------------------------------------------
def _mount_routers() -> None:
    router_modules = {
        "tools": "app_proxy.routers.tools",
        "admin": "app_proxy.routers.admin",
        "approval": "app_proxy.routers.approval",
        "schedules": "app_proxy.routers.schedules",
    }
    for name, module_path in router_modules.items():
        try:
            import importlib

            mod = importlib.import_module(module_path)
            app.include_router(mod.router)
            logger.info("router.mounted", name=name)
        except (ImportError, AttributeError):
            logger.warning("router.skipped", name=name, reason="module not found")


_mount_routers()
