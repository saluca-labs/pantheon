"""Tests for worker email handlers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

# Importing the module registers the handlers
from src import worker_handlers  # noqa: F401
from src.worker import get_handler


def test_email_handlers_are_registered():
    assert get_handler("email.password_reset") is not None
    assert get_handler("email.verification") is not None


@pytest.mark.asyncio
async def test_password_reset_email_sends_via_smtp(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "1025")
    monkeypatch.setenv("WEB_PUBLIC_URL", "https://web.test")

    captured = {}

    class _FakeSMTP:
        def __init__(self, host, port, timeout=10):
            captured["host"] = host
            captured["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            captured["tls"] = True

        def send_message(self, msg):
            captured["to"] = msg["To"]
            captured["subject"] = msg["Subject"]
            captured["body"] = msg.get_content()

    with patch("src.worker_handlers.smtplib.SMTP", _FakeSMTP):
        handler = get_handler("email.password_reset")
        await handler({"email": "x@example.com", "token": "abc123", "user_id": "u"})

    assert captured["host"] == "smtp.example.com"
    assert captured["port"] == 1025
    assert captured["to"] == "x@example.com"
    assert "Reset" in captured["subject"]
    assert "https://web.test/auth/reset?token=abc123" in captured["body"]


@pytest.mark.asyncio
async def test_verification_email_skipped_when_no_smtp(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    handler = get_handler("email.verification")
    # Should NOT raise even though no SMTP is configured
    await handler({"email": "x@example.com", "token": "tok", "user_id": "u"})


@pytest.mark.asyncio
async def test_handler_rejects_missing_payload_keys():
    handler = get_handler("email.password_reset")
    with pytest.raises(ValueError, match="missing required keys"):
        await handler({"email": "x@example.com"})  # no token


@pytest.mark.asyncio
async def test_verification_email_link_uses_web_public_url(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("WEB_PUBLIC_URL", "https://app.tiresias.io")

    captured = {}

    class _FakeSMTP:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def starttls(self): pass
        def send_message(self, msg): captured["body"] = msg.get_content()

    with patch("src.worker_handlers.smtplib.SMTP", _FakeSMTP):
        handler = get_handler("email.verification")
        await handler({"email": "x@example.com", "token": "vtok", "user_id": "u"})

    assert "https://app.tiresias.io/auth/verify?token=vtok" in captured["body"]
