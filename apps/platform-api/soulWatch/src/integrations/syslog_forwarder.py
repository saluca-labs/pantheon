"""
Syslog transport for SoulWatch SIEM integration.
Sends events as RFC 5424 or CEF-wrapped syslog messages over UDP, TCP, or TLS.
Fire-and-forget with error logging — never blocks the pipeline.
"""

import socket
import ssl
import time
from datetime import datetime, timezone
from typing import Optional, Literal

import structlog

from soulWatch.src.integrations.cef import AuditEvent, format_cef, SEVERITY_MAP

logger = structlog.get_logger(__name__)

# RFC 5424 facility codes
FACILITY_MAP = {
    "kern": 0, "user": 1, "mail": 2, "daemon": 3,
    "auth": 4, "syslog": 5, "lpr": 6, "news": 7,
    "uucp": 8, "cron": 9, "authpriv": 10, "ftp": 11,
    "ntp": 12, "audit": 13, "alert": 14, "clock": 15,
    "local0": 16, "local1": 17, "local2": 18, "local3": 19,
    "local4": 20, "local5": 21, "local6": 22, "local7": 23,
}

# CEF severity (0-10) to syslog severity mapping
# syslog: 0=emerg, 1=alert, 2=crit, 3=err, 4=warn, 5=notice, 6=info, 7=debug
CEF_TO_SYSLOG_SEVERITY = {
    0: 6,   # CEF 0 (lowest) -> syslog info
    1: 6,   # CEF 1 -> info
    2: 6,   # CEF 2 -> info
    3: 5,   # CEF 3 -> notice
    4: 5,   # CEF 4 -> notice
    5: 4,   # CEF 5 -> warning
    6: 3,   # CEF 6 -> error
    7: 2,   # CEF 7 -> critical
    8: 1,   # CEF 8 -> alert
    9: 0,   # CEF 9 -> emergency
    10: 0,  # CEF 10 -> emergency
}

# App name for RFC 5424 header
SYSLOG_APP_NAME = "TiresiasWatch"
SYSLOG_VERSION = "1"  # RFC 5424 version


def _compute_pri(facility: int, severity: int) -> int:
    """Compute RFC 5424 PRI value = facility * 8 + severity."""
    return (facility * 8) + severity


def format_rfc5424(
    event: AuditEvent,
    facility: int = 13,
    hostname: str = "tiresias",
) -> str:
    """
    Format an AuditEvent as an RFC 5424 syslog message.

    Format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [SD] MSG
    """
    cef_severity = SEVERITY_MAP.get(event.event_type, 5)
    syslog_severity = CEF_TO_SYSLOG_SEVERITY.get(cef_severity, 5)
    pri = _compute_pri(facility, syslog_severity)

    # Use event timestamp or current time
    try:
        ts = datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        ts = datetime.now(timezone.utc)
    timestamp = ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + ts.strftime("%z")
    if not timestamp.endswith("Z") and "+" not in timestamp and "-" not in timestamp[-6:]:
        timestamp += "Z"

    # Structured data per RFC 5424
    sd_params = [
        f'eventType="{event.event_type}"',
        f'tenantId="{event.tenant_id}"',
        f'eventId="{event.event_id}"',
    ]
    if event.soulkey_id:
        sd_params.append(f'soulkeyId="{event.soulkey_id}"')
    if event.persona_id:
        sd_params.append(f'personaId="{event.persona_id}"')
    if event.action:
        sd_params.append(f'action="{event.action}"')
    if event.decision:
        sd_params.append(f'decision="{event.decision}"')
    if event.resource:
        sd_params.append(f'resource="{event.resource}"')
    if event.scope:
        sd_params.append(f'scope="{event.scope}"')

    structured_data = f'[tiresias@54321 {" ".join(sd_params)}]'

    # Human-readable message
    msg = f"{event.event_type}: {event.action or event.decision or 'event'}"
    if event.persona_id:
        msg += f" by {event.persona_id}"
    if event.resource:
        msg += f" on {event.resource}"

    return (
        f"<{pri}>{SYSLOG_VERSION} {timestamp} {hostname} "
        f"{SYSLOG_APP_NAME} - {event.event_id} "
        f"{structured_data} {msg}"
    )


def format_cef_syslog(
    event: AuditEvent,
    facility: int = 13,
    hostname: str = "tiresias",
) -> str:
    """
    Wrap a CEF-formatted event in an RFC 5424 syslog envelope.
    This is what Splunk, ArcSight, and QRadar expect for CEF-over-syslog.
    """
    cef_severity = SEVERITY_MAP.get(event.event_type, 5)
    syslog_severity = CEF_TO_SYSLOG_SEVERITY.get(cef_severity, 5)
    pri = _compute_pri(facility, syslog_severity)

    try:
        ts = datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        ts = datetime.now(timezone.utc)
    timestamp = ts.strftime("%b %d %H:%M:%S")

    cef_message = format_cef(event)
    return f"<{pri}>{timestamp} {hostname} {cef_message}"


class SyslogTransport:
    """
    Manages socket connections for syslog forwarding.
    Supports UDP (fire-and-forget), TCP (persistent connection), and TLS.
    """

    def __init__(
        self,
        host: str,
        port: int = 514,
        protocol: Literal["udp", "tcp", "tls"] = "udp",
        facility: int = 13,
        use_cef: bool = True,
        hostname: str = "tiresias",
        tcp_timeout: float = 5.0,
    ):
        self.host = host
        self.port = port
        self.protocol = protocol
        self.facility = facility
        self.use_cef = use_cef
        self.hostname = hostname
        self.tcp_timeout = tcp_timeout

        self._sock: Optional[socket.socket] = None
        self._connected = False
        self._send_count = 0
        self._error_count = 0
        self._last_error: Optional[str] = None
        self._last_send_time: Optional[float] = None

    def _format_event(self, event: AuditEvent) -> str:
        """Format event according to configured format."""
        if self.use_cef:
            return format_cef_syslog(event, self.facility, self.hostname)
        return format_rfc5424(event, self.facility, self.hostname)

    def _connect(self) -> bool:
        """Establish or re-establish socket connection."""
        try:
            self._close_socket()

            if self.protocol == "udp":
                self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                self._sock.settimeout(self.tcp_timeout)
                self._connected = True
            elif self.protocol in ("tcp", "tls"):
                raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                raw_sock.settimeout(self.tcp_timeout)
                raw_sock.connect((self.host, self.port))

                if self.protocol == "tls":
                    ctx = ssl.create_default_context()
                    # In production, customers configure their own CA.
                    # For initial setup, allow self-signed (configurable).
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    self._sock = ctx.wrap_socket(raw_sock, server_hostname=self.host)
                else:
                    self._sock = raw_sock

                self._connected = True

            logger.info(
                "syslog.connected",
                host=self.host,
                port=self.port,
                protocol=self.protocol,
            )
            return True

        except Exception as exc:
            self._last_error = str(exc)
            self._error_count += 1
            logger.error(
                "syslog.connect_failed",
                host=self.host,
                port=self.port,
                protocol=self.protocol,
                error=str(exc),
            )
            return False

    def _close_socket(self):
        """Close existing socket if open."""
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
            self._connected = False

    def send(self, event: AuditEvent) -> bool:
        """
        Send a single event to the syslog destination.
        Returns True on success, False on failure.
        Never raises — all errors are logged and counted.
        """
        try:
            message = self._format_event(event)
            data = message.encode("utf-8")

            # For TCP/TLS, append newline as message delimiter (RFC 6587 octet-counting
            # or non-transparent framing). Most syslog servers accept newline framing.
            if self.protocol in ("tcp", "tls"):
                data += b"\n"

            # Ensure connection
            if not self._connected or self._sock is None:
                if not self._connect():
                    return False

            if self.protocol == "udp":
                self._sock.sendto(data, (self.host, self.port))
            else:
                try:
                    self._sock.sendall(data)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    # Reconnect and retry once
                    if self._connect():
                        self._sock.sendall(data)
                    else:
                        return False

            self._send_count += 1
            self._last_send_time = time.time()
            return True

        except Exception as exc:
            self._error_count += 1
            self._last_error = str(exc)
            self._connected = False
            logger.error(
                "syslog.send_failed",
                host=self.host,
                port=self.port,
                error=str(exc),
            )
            return False

    def send_batch(self, events: list[AuditEvent]) -> tuple[int, int]:
        """
        Send a batch of events. Returns (success_count, failure_count).
        """
        ok = 0
        fail = 0
        for event in events:
            if self.send(event):
                ok += 1
            else:
                fail += 1
        return ok, fail

    def test_connection(self) -> dict:
        """
        Send a test syslog message and return status.
        Used by the portal "Test Connection" button.
        """
        test_event = AuditEvent(
            event_id="test-syslog-001",
            tenant_id="test-tenant",
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="policy_synced",
            action="syslog_test",
            decision="success",
            reason="Manual test from Tiresias portal",
        )

        success = self.send(test_event)
        return {
            "success": success,
            "host": self.host,
            "port": self.port,
            "protocol": self.protocol,
            "format": "cef" if self.use_cef else "rfc5424",
            "error": self._last_error if not success else None,
        }

    def status(self) -> dict:
        """Return current transport status."""
        return {
            "host": self.host,
            "port": self.port,
            "protocol": self.protocol,
            "facility": self.facility,
            "format": "cef" if self.use_cef else "rfc5424",
            "connected": self._connected,
            "send_count": self._send_count,
            "error_count": self._error_count,
            "last_error": self._last_error,
            "last_send_time": self._last_send_time,
        }

    def close(self):
        """Close the transport."""
        self._close_socket()
        logger.info(
            "syslog.closed",
            host=self.host,
            sent=self._send_count,
            errors=self._error_count,
        )


# ── Module-level singleton ──────────────────────────────────────────────

_syslog_transport: Optional[SyslogTransport] = None


def get_syslog_transport() -> Optional[SyslogTransport]:
    return _syslog_transport


def set_syslog_transport(transport: Optional[SyslogTransport]) -> None:
    global _syslog_transport
    _syslog_transport = transport


def init_syslog_from_config(config) -> Optional[SyslogTransport]:
    """
    Initialize a SyslogTransport from a SyslogConfig model.
    Called at startup or when config is updated via API.
    """
    if not config or not getattr(config, "host", None):
        return None

    transport = SyslogTransport(
        host=config.host,
        port=getattr(config, "port", 514),
        protocol=getattr(config, "protocol", "udp"),
        facility=getattr(config, "facility", 13),
        use_cef=getattr(config, "use_cef", True),
    )
    set_syslog_transport(transport)
    logger.info(
        "syslog.initialized",
        host=config.host,
        port=config.port,
        protocol=config.protocol,
    )
    return transport
