"""Structured JSON logging + redaction for the Tiresias Matrix appservice.

The hardening pass (PR G) standardises log output across the bridge. Every
record is emitted as a single-line JSON object so SoulWatch (and any
log-shipping sidecar) can parse without per-format heuristics. A sanitising
filter strips ``Authorization`` headers and truncates over-long
``content.body`` strings before they reach a handler.

Design notes:

* No third-party dependencies — stdlib ``logging`` + ``json``.
* ``configure_logging()`` is idempotent and safe to call from tests; it
  installs a single ``StreamHandler`` on the root logger and the
  ``matrix_bridge`` namespace logger.
* The redaction filter operates on the ``LogRecord``'s ``args`` and
  ``__dict__`` so values passed via ``log.info("...", extra={...})`` are
  also scrubbed. Strings are matched conservatively to avoid corrupting
  unrelated payloads.
* A ``REDACTED`` placeholder is used; downstream parsers can rely on its
  literal value to detect that scrubbing happened.

License: Apache-2.0.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from typing import Any, Mapping

REDACTED = "[REDACTED]"
"""Placeholder substituted in for sensitive values."""

# Cap on how much of an ``m.room.message`` body we keep in logs. The
# request handler enforces a much larger transaction-level cap; this is
# only about avoiding noisy log lines for legitimate-but-verbose payloads.
DEFAULT_BODY_LOG_LIMIT = 256

# Header names whose values must never appear in a log record.
_SENSITIVE_HEADER_NAMES = {"authorization", "x-as-token", "x-hs-token"}

# Match ``Bearer <token>`` so we can scrub it even when it leaks into a
# free-text log line via ``log.info("got %s", str(headers))``.
_BEARER_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-+=/]+", re.IGNORECASE)


def _redact_string(value: str, *, body_limit: int = DEFAULT_BODY_LOG_LIMIT) -> str:
    """Return ``value`` with bearer tokens scrubbed and over-long bodies clipped."""
    redacted = _BEARER_RE.sub(f"Bearer {REDACTED}", value)
    if len(redacted) > body_limit:
        return redacted[:body_limit] + f"…[+{len(redacted) - body_limit}ch]"
    return redacted


def _redact_mapping(
    obj: Mapping[str, Any], *, body_limit: int = DEFAULT_BODY_LOG_LIMIT
) -> dict[str, Any]:
    """Walk a mapping and redact sensitive header keys + over-long bodies."""
    out: dict[str, Any] = {}
    for k, v in obj.items():
        key_lower = str(k).lower()
        if key_lower in _SENSITIVE_HEADER_NAMES:
            out[str(k)] = REDACTED
            continue
        if key_lower == "body" and isinstance(v, str) and len(v) > body_limit:
            out[str(k)] = v[:body_limit] + f"…[+{len(v) - body_limit}ch]"
            continue
        if isinstance(v, Mapping):
            out[str(k)] = _redact_mapping(v, body_limit=body_limit)
        elif isinstance(v, str):
            out[str(k)] = _redact_string(v, body_limit=body_limit)
        else:
            out[str(k)] = v
    return out


class RedactingFilter(logging.Filter):
    """Logging filter that scrubs bearer tokens and sensitive header values."""

    def __init__(self, body_limit: int = DEFAULT_BODY_LOG_LIMIT) -> None:
        super().__init__()
        self._body_limit = body_limit

    def filter(self, record: logging.LogRecord) -> bool:
        # ``record.msg`` may be a format string with ``args`` filled in
        # later by Formatter.format(); we redact both sides.
        if isinstance(record.msg, str):
            record.msg = _redact_string(record.msg, body_limit=self._body_limit)
        if record.args:
            if isinstance(record.args, Mapping):
                record.args = _redact_mapping(record.args, body_limit=self._body_limit)
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    _redact_string(a, body_limit=self._body_limit)
                    if isinstance(a, str)
                    else _redact_mapping(a, body_limit=self._body_limit)
                    if isinstance(a, Mapping)
                    else a
                    for a in record.args
                )
        # ``extra={...}`` values land directly on the record's __dict__.
        for key in list(record.__dict__):
            if key.lower() in _SENSITIVE_HEADER_NAMES:
                record.__dict__[key] = REDACTED
        return True


class JsonFormatter(logging.Formatter):
    """Format every record as a single-line JSON object.

    The shape is intentionally minimal so log shippers see a stable schema:

    ``{"ts": <iso8601>, "level": "INFO", "logger": "...", "msg": "...",
       "extra": {...}}``.

    ``extra`` carries any non-standard attributes attached via the
    ``extra=`` kwarg of ``log.info()``.
    """

    _RESERVED_RECORD_ATTRS = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "asctime",
        "message",
        "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self._RESERVED_RECORD_ATTRS and not k.startswith("_")
        }
        if extras:
            payload["extra"] = extras
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
    """Install the JSON formatter + redaction filter on the root logger.

    Idempotent: repeated calls are no-ops. Tests that need a fresh logger
    state can call ``logging.getLogger().handlers.clear()`` before re-running
    ``configure_logging``.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    # Belt-and-braces: also pin the namespace logger so libraries that
    # already grabbed a child logger don't bypass the filter.
    logging.getLogger("matrix_bridge").setLevel(level)
    _CONFIGURED = True
