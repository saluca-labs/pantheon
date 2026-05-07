"""PII / secret redaction middleware for log records (Phase C).

Patterns applied to all string leaf values in a log record's extra-dict
before the record is serialized to stdout. The SecurityAuditHandler (Phase B)
writes raw values into _security_audit, which is encrypted-at-rest — so
redaction is stdout-only.

Env vars:
  - REDACT_IPV4_PRIVATE=true   enables RFC 1918 private IPv4 redaction (default OFF)
  - TIRESIAS_LOG_REDACT_ALLOWLIST=comma,sep,fields  per-record field allowlist

Identity fields (actor_id, tenant_id, resource_id) are ALWAYS allowlisted.
"""
from __future__ import annotations

import os
import re
from typing import Any, Iterable

# --- Pattern definitions ---------------------------------------------------

# RFC 5321 / practical email. Lowercase plus digits plus common punctuation.
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# Bearer tokens (OAuth2 / JWT-style). Match "Bearer" followed by a token-ish word.
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9_\-\.=]{8,}\b")

# Common API key formats. Stripe (sk_live_, sk_test_, rk_live_, pk_live_);
# AWS access key (AKIA...); Google API key (AIza...); generic long hex/base62.
_STRIPE_KEY = re.compile(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b")
_AWS_KEY = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
_GOOGLE_API_KEY = re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")
_GENERIC_API_KEY = re.compile(r"\b(?:api[_\-]?key|apikey|secret)[\"'\s:=]+[A-Za-z0-9_\-]{24,}\b", re.IGNORECASE)

# Tiresias internal API keys (tir_<slug>_<hex32>).
_TIRESIAS_KEY = re.compile(r"\btir_[A-Za-z0-9]+_[A-Fa-f0-9]{32}\b")

# SSN (US) with separators or none.
_SSN = re.compile(r"\b(?!000|666|9\d\d)\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b")

# Credit card (Luhn validated post-match).
_CC = re.compile(r"\b(?:\d[ -]?){13,19}\b")

# US phone (loose). Not enabled by default in record scan; included for completeness.
_PHONE_US = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")

# RFC 1918 private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).
_IPV4_PRIVATE = re.compile(
    r"\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b"
)

# --- Identity fields (never redacted) -------------------------------------

_IDENTITY_FIELDS = frozenset({
    "actor_id", "tenant_id", "resource_id", "session_id", "trace_id", "request_id",
    "event_type", "actor_type", "outcome", "resource_type", "service",
    "level", "ts", "schema_version", "logger", "msg",
})


def _luhn_valid(digits: str) -> bool:
    """Luhn checksum for credit-card number validation."""
    total = 0
    alt = False
    for ch in reversed(digits):
        if not ch.isdigit():
            continue
        n = int(ch)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0 and len([c for c in digits if c.isdigit()]) >= 13


def _redact_cc(match: re.Match[str]) -> str:
    raw = match.group(0)
    if _luhn_valid(raw):
        return "[REDACTED:credit_card]"
    return raw


class LogRedactor:
    """Pattern-based redactor. Call `redact(str)` for text, `redact_record(dict)` for records."""

    def __init__(
        self,
        allowlist: Iterable[str] | None = None,
        enable_ipv4_private: bool | None = None,
    ) -> None:
        extras = set(allowlist or ())
        self.allowlist = _IDENTITY_FIELDS | extras
        if enable_ipv4_private is None:
            enable_ipv4_private = os.environ.get("REDACT_IPV4_PRIVATE", "false").lower() == "true"
        self.enable_ipv4_private = enable_ipv4_private

    def redact(self, text: str) -> str:
        if not isinstance(text, str) or not text:
            return text
        out = _EMAIL.sub("[REDACTED:email]", text)
        out = _BEARER.sub("[REDACTED:bearer]", out)
        out = _TIRESIAS_KEY.sub("[REDACTED:tiresias_key]", out)
        out = _STRIPE_KEY.sub("[REDACTED:stripe_key]", out)
        out = _AWS_KEY.sub("[REDACTED:aws_key]", out)
        out = _GOOGLE_API_KEY.sub("[REDACTED:google_api_key]", out)
        out = _GENERIC_API_KEY.sub("[REDACTED:api_key]", out)
        out = _SSN.sub("[REDACTED:ssn]", out)
        out = _CC.sub(_redact_cc, out)
        if self.enable_ipv4_private:
            out = _IPV4_PRIVATE.sub("[REDACTED:ipv4_private]", out)
        return out

    def redact_record(self, record: dict[str, Any]) -> dict[str, Any]:
        """Recursively redact string leaves; skip allowlisted top-level fields."""
        out: dict[str, Any] = {}
        for k, v in record.items():
            if k in self.allowlist:
                out[k] = v
                continue
            out[k] = self._redact_value(v)
        return out

    def _redact_value(self, v: Any) -> Any:
        if isinstance(v, str):
            return self.redact(v)
        if isinstance(v, dict):
            return {k: self._redact_value(val) for k, val in v.items()}
        if isinstance(v, list):
            return [self._redact_value(x) for x in v]
        return v


def get_default_redactor() -> LogRedactor:
    """Build a LogRedactor from env vars."""
    raw = os.environ.get("TIRESIAS_LOG_REDACT_ALLOWLIST", "")
    allow = [f.strip() for f in raw.split(",") if f.strip()]
    return LogRedactor(allowlist=allow)
