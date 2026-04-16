"""Structured-logging config for tiresias-proxy.

Phase A: canonical JSON stdout + SECURITY level (45).
Phase B: hash-chained SECURITY audit handler (DB write, raw format).
Phase C: redacting JSON formatter for stdout.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any

SERVICE_NAME: str = "tiresias-proxy"
SCHEMA_VERSION: str = "1"
SECURITY_LEVEL: int = 45


class JsonFormatter(logging.Formatter):
    """Canonical JSON log format per LOGGING_STACK_DESIGN.md §1."""

    def format(self, record: logging.LogRecord) -> str:
        base: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "schema_version": SCHEMA_VERSION,
            "level": record.levelname,
            "service": SERVICE_NAME,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            base["exc"] = self.formatException(record.exc_info)
        skip = {
            "name", "msg", "args", "levelname", "levelno", "pathname",
            "filename", "module", "exc_info", "exc_text", "stack_info",
            "lineno", "funcName", "created", "msecs", "relativeCreated",
            "thread", "threadName", "processName", "process", "message",
            "taskName",
        }
        for k, v in record.__dict__.items():
            if k not in skip and not k.startswith("_"):
                base[k] = v
        return json.dumps(base, default=str)


class _SecurityAlwaysFilter(logging.Filter):
    """Allow SECURITY (45) records regardless of the logger's level."""

    def filter(self, record: logging.LogRecord) -> bool:
        return True


# Singleton handler reference so tests + app wiring can inject engine factory.
_security_audit_handler = None


def get_security_audit_handler():
    return _security_audit_handler


def configure_logging(log_level: str | None = None) -> None:
    """Configure the root logger with a JSON stdout handler. Idempotent."""
    global _security_audit_handler

    level_str = (log_level or os.environ.get("TIRESIAS_LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_str, logging.INFO)

    # SECURITY tier (Phase B) — register name.
    if logging.getLevelName(SECURITY_LEVEL) != "SECURITY":
        logging.addLevelName(SECURITY_LEVEL, "SECURITY")

    # Phase C: redacting formatter for stdout.
    try:
        from tiresias.proxy.redacting_formatter import RedactingJsonFormatter
        stdout_formatter: logging.Formatter = RedactingJsonFormatter()
    except Exception:
        stdout_formatter = JsonFormatter()

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(stdout_formatter)
    stdout_handler.setLevel(level)
    stdout_handler.addFilter(_SecurityAlwaysFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.DEBUG)  # handlers do the filtering
    root.addHandler(stdout_handler)

    # Phase B: SECURITY audit handler. Engine factory attached later by lifespan.
    from tiresias.proxy.audit_handler import SecurityAuditHandler
    _security_audit_handler = SecurityAuditHandler()
    root.addHandler(_security_audit_handler)

    # Suppress known-noisy third-party loggers
    for noisy in ("httpx", "httpcore", "uvicorn.error", "uvicorn.access", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # Startup canary -- if this doesn't appear in pod logs, the config didn't take
    log = logging.getLogger(SERVICE_NAME)
    log.log(SECURITY_LEVEL, "logger_initialized", extra={
        "event_type": "lifecycle.logger.initialized",
        "actor_id": "system", "actor_type": "system",
        "outcome": "success", "resource_type": "logger",
        "resource_id": SERVICE_NAME, "tenant_id": "platform",
    })
