"""
Worker job handlers for platform-api.

Auto-imported by `src.worker` on startup. Each handler is registered with
``@register("kind")`` and receives the raw payload dict.

Handlers shipped here:
    email.password_reset    — send the password-reset email
    email.verification      — send the email-verification email

When SMTP_HOST is not configured the handler logs the message instead of
sending. This keeps dev environments friction-free while still exercising
the full enqueue/dispatch path.
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage

from src.worker import register

logger = logging.getLogger("platform.worker.handlers")


def _build_password_reset_email(payload: dict) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Reset your Tiresias password"
    msg["From"] = os.environ.get("SMTP_FROM", "no-reply@tiresias.local")
    msg["To"] = payload["email"]
    web = os.environ.get("WEB_PUBLIC_URL", "http://localhost:3000")
    link = f"{web}/auth/reset?token={payload['token']}"
    msg.set_content(
        f"Hi,\n\nUse this link to reset your password (valid for 1 hour):\n\n{link}\n\n"
        "If you didn't request this, you can ignore the email.\n\n— Tiresias"
    )
    return msg


def _build_verification_email(payload: dict) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Verify your Tiresias email"
    msg["From"] = os.environ.get("SMTP_FROM", "no-reply@tiresias.local")
    msg["To"] = payload["email"]
    web = os.environ.get("WEB_PUBLIC_URL", "http://localhost:3000")
    link = f"{web}/auth/verify?token={payload['token']}"
    msg.set_content(
        f"Hi,\n\nConfirm your email address by visiting:\n\n{link}\n\n— Tiresias"
    )
    return msg


def _send_via_smtp(msg: EmailMessage) -> None:
    host = os.environ.get("SMTP_HOST")
    if not host:
        logger.info(
            "worker.email.skipped reason=no_smtp_host to=%s subject=%s",
            msg["To"],
            msg["Subject"],
        )
        return

    port = int(os.environ.get("SMTP_PORT", "1025"))
    use_tls = os.environ.get("SMTP_USE_TLS", "").lower() in {"1", "true", "yes"}
    username = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")

    with smtplib.SMTP(host, port, timeout=10) as smtp:
        if use_tls:
            smtp.starttls()
        if username:
            smtp.login(username, password or "")
        smtp.send_message(msg)
    logger.info("worker.email.sent to=%s subject=%s", msg["To"], msg["Subject"])


async def _send_async(msg: EmailMessage) -> None:
    """Run blocking smtplib in a thread so the event loop stays responsive."""
    await asyncio.to_thread(_send_via_smtp, msg)


@register("email.password_reset")
async def handle_password_reset_email(payload: dict) -> None:
    if "email" not in payload or "token" not in payload:
        raise ValueError("email.password_reset payload missing required keys")
    await _send_async(_build_password_reset_email(payload))


@register("email.verification")
async def handle_verification_email(payload: dict) -> None:
    if "email" not in payload or "token" not in payload:
        raise ValueError("email.verification payload missing required keys")
    await _send_async(_build_verification_email(payload))
