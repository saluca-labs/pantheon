"""
SIEM forwarder implementations.
Each forwarder sends audit events to a specific SIEM/log collection backend.
All forwarders are async and use httpx for HTTP transport.
"""

import abc
import base64
import hashlib
import hmac
import logging
import socket
import struct
from datetime import datetime, timezone
from typing import Optional

import httpx

from src.integrations.cef import AuditEvent, format_cef
from src.integrations.config import (
    SplunkConfig,
    ElasticConfig,
    SyslogConfig,
    WebhookConfig,
    AzureSentinelConfig,
)

logger = logging.getLogger(__name__)


class SIEMForwarder(abc.ABC):
    """Abstract base class for SIEM event forwarders."""

    @abc.abstractmethod
    async def forward_event(self, event: AuditEvent) -> bool:
        """
        Forward a single audit event.
        Returns True on success, False on failure.
        """
        ...

    @abc.abstractmethod
    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        """
        Forward a batch of audit events.
        Returns True if all succeeded, False if any failed.
        """
        ...

    @abc.abstractmethod
    async def health_check(self) -> bool:
        """
        Check connectivity to the SIEM backend.
        Returns True if healthy.
        """
        ...

    async def close(self) -> None:
        """Clean up resources. Override if needed."""
        pass


class SplunkHECForwarder(SIEMForwarder):
    """
    Splunk HTTP Event Collector forwarder.
    Posts JSON events to the HEC /services/collector endpoint.
    """

    def __init__(self, config: SplunkConfig):
        self.config = config
        self._client = httpx.AsyncClient(
            verify=config.verify_ssl,
            timeout=httpx.Timeout(30.0),
            headers={
                "Authorization": f"Splunk {config.hec_token}",
                "Content-Type": "application/json",
            },
        )

    def _format_event(self, event: AuditEvent) -> dict:
        return {
            "time": event.timestamp,
            "source": self.config.source,
            "sourcetype": self.config.sourcetype,
            "index": self.config.index,
            "event": event.to_dict(),
        }

    async def forward_event(self, event: AuditEvent) -> bool:
        try:
            payload = self._format_event(event)
            resp = await self._client.post(self.config.hec_url, json=payload)
            if resp.status_code == 200:
                return True
            logger.warning(
                "Splunk HEC rejected event: status=%d body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        except Exception as exc:
            logger.error("Splunk HEC forward failed: %s", exc)
            return False

    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        if not events:
            return True
        try:
            # Splunk HEC accepts newline-delimited JSON for batch
            import json
            lines = "\n".join(json.dumps(self._format_event(e)) for e in events)
            resp = await self._client.post(
                self.config.hec_url,
                content=lines,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                return True
            logger.warning(
                "Splunk HEC batch rejected: status=%d body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        except Exception as exc:
            logger.error("Splunk HEC batch forward failed: %s", exc)
            return False

    async def health_check(self) -> bool:
        try:
            # HEC health endpoint
            url = self.config.hec_url.rstrip("/")
            if url.endswith("/services/collector"):
                health_url = url.replace("/services/collector", "/services/collector/health")
            else:
                health_url = url + "/health"
            resp = await self._client.get(health_url)
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()


class ElasticForwarder(SIEMForwarder):
    """
    Elasticsearch / OpenSearch forwarder.
    Uses the Bulk API for efficient event ingestion.
    """

    def __init__(self, config: ElasticConfig):
        self.config = config
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if config.api_key:
            headers["Authorization"] = f"ApiKey {config.api_key}"
        auth = None
        if config.username and config.password:
            auth = httpx.BasicAuth(config.username, config.password)
        self._client = httpx.AsyncClient(
            verify=config.verify_ssl,
            timeout=httpx.Timeout(30.0),
            headers=headers,
            auth=auth,
        )

    def _index_name(self, event: AuditEvent) -> str:
        date_str = event.timestamp[:10].replace("-", ".")
        return self.config.index_pattern.replace("{date}", date_str)

    async def forward_event(self, event: AuditEvent) -> bool:
        try:
            index = self._index_name(event)
            url = f"{self.config.url.rstrip('/')}/{index}/_doc/{event.event_id}"
            resp = await self._client.put(url, json=event.to_dict())
            if resp.status_code in (200, 201):
                return True
            logger.warning(
                "Elastic index failed: status=%d body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        except Exception as exc:
            logger.error("Elastic forward failed: %s", exc)
            return False

    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        if not events:
            return True
        try:
            import json
            lines: list[str] = []
            for event in events:
                index = self._index_name(event)
                action = json.dumps({"index": {"_index": index, "_id": event.event_id}})
                doc = json.dumps(event.to_dict())
                lines.append(action)
                lines.append(doc)
            body = "\n".join(lines) + "\n"
            resp = await self._client.post(
                f"{self.config.url.rstrip('/')}/_bulk",
                content=body,
                headers={"Content-Type": "application/x-ndjson"},
            )
            if resp.status_code == 200:
                result = resp.json()
                if result.get("errors"):
                    logger.warning("Elastic bulk had errors: %s", result)
                    return False
                return True
            logger.warning("Elastic bulk failed: status=%d", resp.status_code)
            return False
        except Exception as exc:
            logger.error("Elastic batch forward failed: %s", exc)
            return False

    async def health_check(self) -> bool:
        try:
            resp = await self._client.get(f"{self.config.url.rstrip('/')}/_cluster/health")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("status") in ("green", "yellow")
            return False
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()


class SyslogForwarder(SIEMForwarder):
    """
    RFC 5424 syslog forwarder.
    Supports TCP and UDP transport with optional CEF formatting.
    """

    # Severity mapping: event_type -> syslog severity (0=emergency..7=debug)
    SYSLOG_SEVERITY = {
        "auth_grant": 6,       # informational
        "auth_deny": 4,        # warning
        "key_issued": 6,
        "key_suspended": 4,
        "key_revoked": 3,      # error
        "key_reinstated": 6,
        "scope_violation": 3,
        "capability_issued": 6,
        "capability_used": 6,
        "capability_revoked": 4,
        "policy_synced": 6,
        "policy_violation": 3,
        "escalation_requested": 5,  # notice
        "escalation_approved": 5,
        "escalation_denied": 4,
    }

    def __init__(self, config: SyslogConfig):
        self.config = config
        self._sock: Optional[socket.socket] = None

    def _get_socket(self) -> socket.socket:
        if self._sock is None:
            if self.config.protocol == "tcp":
                self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self._sock.settimeout(10)
                self._sock.connect((self.config.host, self.config.port))
            else:
                self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                self._sock.settimeout(10)
        return self._sock

    def _format_message(self, event: AuditEvent) -> bytes:
        severity = self.SYSLOG_SEVERITY.get(event.event_type, 6)
        priority = self.config.facility * 8 + severity

        if self.config.use_cef:
            msg_body = format_cef(event)
        else:
            import json
            msg_body = json.dumps(event.to_dict())

        # RFC 5424 header: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID MSG
        syslog_msg = (
            f"<{priority}>1 {event.timestamp} soulauth soulauth - - - {msg_body}"
        )

        encoded = syslog_msg.encode("utf-8")
        if self.config.protocol == "tcp":
            # TCP syslog uses octet-counting framing
            return f"{len(encoded)} ".encode("utf-8") + encoded
        return encoded

    async def forward_event(self, event: AuditEvent) -> bool:
        try:
            sock = self._get_socket()
            msg = self._format_message(event)
            if self.config.protocol == "tcp":
                sock.sendall(msg)
            else:
                sock.sendto(msg, (self.config.host, self.config.port))
            return True
        except Exception as exc:
            logger.error("Syslog forward failed: %s", exc)
            self._sock = None  # Reset socket on failure
            return False

    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        success = True
        for event in events:
            if not await self.forward_event(event):
                success = False
        return success

    async def health_check(self) -> bool:
        try:
            sock = self._get_socket()
            return sock is not None
        except Exception:
            return False

    async def close(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None


class WebhookForwarder(SIEMForwarder):
    """
    Generic webhook forwarder.
    POSTs JSON to any URL with configurable headers and retry logic.
    """

    def __init__(self, config: WebhookConfig):
        self.config = config
        headers = {"Content-Type": "application/json"}
        headers.update(config.headers)
        self._client = httpx.AsyncClient(
            verify=config.verify_ssl,
            timeout=httpx.Timeout(30.0),
            headers=headers,
        )

    async def _post_with_retry(self, payload: dict | list) -> bool:
        import asyncio
        last_exc = None
        for attempt in range(self.config.max_retries + 1):
            try:
                resp = await self._client.post(self.config.url, json=payload)
                if 200 <= resp.status_code < 300:
                    return True
                if resp.status_code < 500:
                    # Client error — don't retry
                    logger.warning(
                        "Webhook rejected: status=%d body=%s",
                        resp.status_code,
                        resp.text[:200],
                    )
                    return False
                # Server error — retry
                last_exc = Exception(f"HTTP {resp.status_code}")
            except Exception as exc:
                last_exc = exc

            if attempt < self.config.max_retries:
                delay = self.config.retry_base_delay * (2 ** attempt)
                await asyncio.sleep(delay)

        logger.error("Webhook forward failed after %d retries: %s", self.config.max_retries, last_exc)
        return False

    async def forward_event(self, event: AuditEvent) -> bool:
        return await self._post_with_retry(event.to_dict())

    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        payload = [e.to_dict() for e in events]
        return await self._post_with_retry(payload)

    async def health_check(self) -> bool:
        try:
            resp = await self._client.head(self.config.url)
            return resp.status_code < 500
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()


class AzureSentinelForwarder(SIEMForwarder):
    """
    Azure Sentinel / Log Analytics forwarder.
    Uses the HTTP Data Collector API with HMAC-SHA256 authentication.
    """

    API_VERSION = "2016-04-01"

    def __init__(self, config: AzureSentinelConfig):
        self.config = config
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    def _build_signature(self, date: str, content_length: int, method: str, content_type: str, resource: str) -> str:
        """Build the HMAC-SHA256 authorization header."""
        x_headers = f"x-ms-date:{date}"
        string_to_hash = f"{method}\n{content_length}\n{content_type}\n{x_headers}\n{resource}"
        bytes_to_hash = string_to_hash.encode("utf-8")
        decoded_key = base64.b64decode(self.config.shared_key)
        encoded_hash = base64.b64encode(
            hmac.new(decoded_key, bytes_to_hash, digestmod=hashlib.sha256).digest()
        ).decode("utf-8")
        return f"SharedKey {self.config.workspace_id}:{encoded_hash}"

    def _build_request(self, body: str) -> tuple[str, dict[str, str]]:
        """Build the URL and headers for the Data Collector API."""
        rfc1123date = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
        content_type = "application/json"
        resource = "/api/logs"
        content_length = len(body)

        signature = self._build_signature(
            rfc1123date, content_length, "POST", content_type, resource,
        )

        url = (
            f"https://{self.config.workspace_id}.ods.opinsights.azure.com"
            f"{resource}?api-version={self.API_VERSION}"
        )
        headers = {
            "Content-Type": content_type,
            "Authorization": signature,
            "Log-Type": self.config.log_type,
            "x-ms-date": rfc1123date,
        }
        return url, headers

    async def forward_event(self, event: AuditEvent) -> bool:
        import json
        body = json.dumps([event.to_dict()])
        return await self._send(body)

    async def forward_batch(self, events: list[AuditEvent]) -> bool:
        if not events:
            return True
        import json
        body = json.dumps([e.to_dict() for e in events])
        return await self._send(body)

    async def _send(self, body: str) -> bool:
        try:
            url, headers = self._build_request(body)
            resp = await self._client.post(url, content=body, headers=headers)
            if resp.status_code in (200, 202):
                return True
            logger.warning(
                "Azure Sentinel rejected: status=%d body=%s",
                resp.status_code,
                resp.text[:200],
            )
            return False
        except Exception as exc:
            logger.error("Azure Sentinel forward failed: %s", exc)
            return False

    async def health_check(self) -> bool:
        # Azure Log Analytics doesn't have a dedicated health endpoint;
        # attempt a minimal POST and check for auth success.
        import json
        body = json.dumps([{"health_check": True}])
        try:
            url, headers = self._build_request(body)
            resp = await self._client.post(url, content=body, headers=headers)
            return resp.status_code in (200, 202)
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()


def create_forwarder(config) -> SIEMForwarder:
    """Factory: create the right forwarder from a config object."""
    from src.integrations.config import (
        SplunkConfig as SC,
        ElasticConfig as EC,
        SyslogConfig as SyC,
        WebhookConfig as WC,
        AzureSentinelConfig as AC,
    )
    if isinstance(config, SC):
        return SplunkHECForwarder(config)
    if isinstance(config, EC):
        return ElasticForwarder(config)
    if isinstance(config, SyC):
        return SyslogForwarder(config)
    if isinstance(config, WC):
        return WebhookForwarder(config)
    if isinstance(config, AC):
        return AzureSentinelForwarder(config)
    raise ValueError(f"Unknown SIEM config type: {type(config)}")
