"""Redacting JSON formatter for stdout (Phase C).

Wraps JsonFormatter; redacts string leaves on the serialized record before
flushing to stdout. SecurityAuditHandler uses the raw JsonFormatter because
DB storage is encrypted-at-rest and the chain hash must be computed over
the unredacted payload.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from tiresias.proxy.logging_utils import JsonFormatter
from tiresias.proxy.redactor import LogRedactor, get_default_redactor


class RedactingJsonFormatter(JsonFormatter):
    """JsonFormatter that redacts PII/secrets in string leaves before emission."""

    def __init__(self, redactor: LogRedactor | None = None) -> None:
        super().__init__()
        self._redactor = redactor or get_default_redactor()

    def format(self, record: logging.LogRecord) -> str:
        raw = super().format(record)
        try:
            obj: dict[str, Any] = json.loads(raw)
        except Exception:
            # If the base formatter produced non-JSON, fall back to string redaction.
            return self._redactor.redact(raw)
        redacted = self._redactor.redact_record(obj)
        return json.dumps(redacted, default=str)
