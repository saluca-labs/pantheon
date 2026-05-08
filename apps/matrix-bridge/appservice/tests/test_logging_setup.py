"""Tests for logging_setup: JSON formatting + redaction.

License: Apache-2.0.
"""

from __future__ import annotations

import io
import json
import logging

from matrix_bridge.logging_setup import (
    JsonFormatter,
    REDACTED,
    RedactingFilter,
    _redact_mapping,
    _redact_string,
)


def test_redact_string_scrubs_bearer_tokens() -> None:
    out = _redact_string("Authorization: Bearer abc123.def-456_ghi=")
    assert "abc123" not in out
    assert REDACTED in out


def test_redact_string_truncates_long_values() -> None:
    long = "x" * 1000
    out = _redact_string(long, body_limit=100)
    assert len(out) < len(long)
    assert out.endswith("ch]")


def test_redact_mapping_strips_authorization() -> None:
    payload = {
        "Authorization": "Bearer secret",
        "X-AS-Token": "as-secret",
        "user_id": "@agent:tiresias.local",
        "nested": {"authorization": "Bearer also-secret"},
    }
    out = _redact_mapping(payload)
    assert out["Authorization"] == REDACTED
    assert out["X-AS-Token"] == REDACTED
    assert out["nested"]["authorization"] == REDACTED
    assert out["user_id"] == "@agent:tiresias.local"


def test_redact_mapping_truncates_long_body() -> None:
    payload = {"body": "x" * 1000}
    out = _redact_mapping(payload, body_limit=64)
    assert "ch]" in out["body"]
    assert len(out["body"]) < 1000


def test_json_formatter_emits_required_fields() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="matrix_bridge.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    rendered = formatter.format(record)
    payload = json.loads(rendered)
    assert payload["msg"] == "hello world"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "matrix_bridge.test"
    assert "ts" in payload


def test_json_formatter_includes_extras() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="matrix_bridge.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="event",
        args=(),
        exc_info=None,
    )
    record.txn_id = "txn-7"
    record.event_id = "$evt-9"
    payload = json.loads(formatter.format(record))
    assert payload["extra"] == {"txn_id": "txn-7", "event_id": "$evt-9"}


def test_redacting_filter_scrubs_msg_and_args() -> None:
    handler = logging.StreamHandler(stream=io.StringIO())
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactingFilter())

    logger = logging.getLogger("matrix_bridge.test_filter")
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    logger.info("got Authorization: Bearer leaked-token")
    logger.info("headers=%s", {"Authorization": "Bearer also-leaked"})

    output = handler.stream.getvalue()
    assert "leaked-token" not in output
    assert "also-leaked" not in output
    assert REDACTED in output
