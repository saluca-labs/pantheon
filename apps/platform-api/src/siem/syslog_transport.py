"""
SyslogTransport — sends CEF-formatted strings to a syslog endpoint.

Supports UDP, TCP, and TLS transports. Each send() call opens a fresh
connection (stateless) so this is correct for moderate-volume SIEM use.
For high-volume use a persistent TCP connection would be preferred but
that adds lifecycle complexity not needed here.

RFC 5424 framing for TCP: octet-count framing is used when use_rfc5424=True.
Default is newline-delimited (compatible with most SIEMs).
"""

from __future__ import annotations

import asyncio
import socket
import ssl
import structlog
from enum import Enum
from typing import Optional

logger = structlog.get_logger(__name__)


class SyslogProtocol(str, Enum):
    UDP = "udp"
    TCP = "tcp"
    TLS = "tls"


class SyslogTransport:
    """
    Sends syslog messages (CEF strings or plain text) to a remote endpoint.

    Args:
        host: Syslog server hostname or IP.
        port: Syslog server port (default 514 for UDP/TCP, 6514 for TLS).
        protocol: "udp", "tcp", or "tls".
        tls_verify: Whether to verify the server TLS certificate.
        tls_ca_cert: Path to CA bundle for TLS verification.
        facility: Syslog facility number (13 = log audit).
        timeout: Connection/send timeout in seconds.
    """

    def __init__(
        self,
        host: str,
        port: int = 514,
        protocol: SyslogProtocol = SyslogProtocol.UDP,
        tls_verify: bool = True,
        tls_ca_cert: Optional[str] = None,
        facility: int = 13,
        timeout: float = 5.0,
    ) -> None:
        self.host = host
        self.port = port
        self.protocol = SyslogProtocol(protocol) if isinstance(protocol, str) else protocol
        self.tls_verify = tls_verify
        self.tls_ca_cert = tls_ca_cert
        self.facility = facility
        self.timeout = timeout

    def _build_priority(self, severity_int: int) -> int:
        """Compute syslog priority from facility and severity (0=emerg, 7=debug)."""
        # Map SIEM severity integer (0-10 CEF scale) to syslog severity (0-7)
        syslog_severity = max(0, min(7, 7 - int(severity_int / 10 * 7)))
        return (self.facility * 8) + syslog_severity

    def _wrap_message(self, message: str, priority: int) -> bytes:
        """Wrap a message in minimal syslog framing."""
        syslog_msg = f"<{priority}>{message}\n"
        return syslog_msg.encode("utf-8", errors="replace")

    async def send(self, message: str, severity_int: int = 5) -> bool:
        """
        Send a syslog message to the configured endpoint.

        Args:
            message: The CEF string or plain text to send.
            severity_int: CEF severity (0-10) for priority calculation.

        Returns:
            True on success, False on any error.
        """
        priority = self._build_priority(severity_int)
        payload = self._wrap_message(message, priority)

        try:
            if self.protocol == SyslogProtocol.UDP:
                return await self._send_udp(payload)
            elif self.protocol == SyslogProtocol.TCP:
                return await self._send_tcp(payload)
            elif self.protocol == SyslogProtocol.TLS:
                return await self._send_tls(payload)
            else:
                logger.error("syslog.unknown_protocol", protocol=str(self.protocol))
                return False
        except Exception as exc:
            logger.warning(
                "syslog.send_failed",
                host=self.host,
                port=self.port,
                protocol=str(self.protocol),
                error=str(exc),
            )
            return False

    async def _send_udp(self, payload: bytes) -> bool:
        loop = asyncio.get_event_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(self.timeout)
        try:
            await loop.run_in_executor(
                None, lambda: sock.sendto(payload, (self.host, self.port))
            )
            logger.debug("syslog.sent_udp", host=self.host, port=self.port, bytes=len(payload))
            return True
        finally:
            sock.close()

    async def _send_tcp(self, payload: bytes) -> bool:
        loop = asyncio.get_event_loop()

        def _sync_send():
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((self.host, self.port))
            sock.sendall(payload)
            sock.close()

        await loop.run_in_executor(None, _sync_send)
        logger.debug("syslog.sent_tcp", host=self.host, port=self.port, bytes=len(payload))
        return True

    async def _send_tls(self, payload: bytes) -> bool:
        loop = asyncio.get_event_loop()

        def _sync_send():
            ctx = ssl.create_default_context()
            if not self.tls_verify:
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            if self.tls_ca_cert:
                ctx.load_verify_locations(self.tls_ca_cert)

            raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            raw_sock.settimeout(self.timeout)
            tls_sock = ctx.wrap_socket(raw_sock, server_hostname=self.host)
            tls_sock.connect((self.host, self.port))
            tls_sock.sendall(payload)
            tls_sock.close()

        await loop.run_in_executor(None, _sync_send)
        logger.debug("syslog.sent_tls", host=self.host, port=self.port, bytes=len(payload))
        return True

    async def health_check(self) -> bool:
        """
        Test connectivity to the syslog endpoint.
        For UDP sends a minimal test message; for TCP/TLS checks connect.
        """
        try:
            if self.protocol == SyslogProtocol.UDP:
                # UDP is connectionless -- send a tiny probe and assume success
                await self._send_udp(b"<0>tiresias health_check\n")
                return True
            elif self.protocol == SyslogProtocol.TCP:
                loop = asyncio.get_event_loop()

                def _tcp_probe():
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(self.timeout)
                    s.connect((self.host, self.port))
                    s.close()

                await loop.run_in_executor(None, _tcp_probe)
                return True
            elif self.protocol == SyslogProtocol.TLS:
                loop = asyncio.get_event_loop()

                def _tls_probe():
                    ctx = ssl.create_default_context()
                    if not self.tls_verify:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    raw.settimeout(self.timeout)
                    tls = ctx.wrap_socket(raw, server_hostname=self.host)
                    tls.connect((self.host, self.port))
                    tls.close()

                await loop.run_in_executor(None, _tls_probe)
                return True
        except Exception as exc:
            logger.warning("syslog.health_check_failed", host=self.host, port=self.port, error=str(exc))
            return False
        return False
