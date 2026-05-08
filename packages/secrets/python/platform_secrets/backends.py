"""Concrete secret backends.

All cloud SDK imports are deferred to first use so the package itself
remains zero-dep. Apps that don't use Vault never need to install ``hvac``.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from platform_secrets.errors import SecretBackendError

logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _ttl_cache_get(
    cache: Dict[str, Tuple[float, Optional[str]]],
    key: str,
    ttl: float,
) -> Tuple[bool, Optional[str]]:
    """Return ``(hit, value)``. Hit only if the entry is still fresh."""
    entry = cache.get(key)
    if entry is None:
        return False, None
    expires_at, value = entry
    if expires_at < time.monotonic():
        cache.pop(key, None)
        return False, None
    return True, value


def _ttl_cache_set(
    cache: Dict[str, Tuple[float, Optional[str]]],
    key: str,
    value: Optional[str],
    ttl: float,
) -> None:
    cache[key] = (time.monotonic() + ttl, value)


# ── env:// ──────────────────────────────────────────────────────────────────


@dataclass
class EnvBackend:
    scheme: str = "env"

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        # ``no_cache`` is irrelevant for env vars — the OS already owns the
        # source of truth — but accepted for protocol uniformity.
        return os.environ.get(path)


# ── file:// ─────────────────────────────────────────────────────────────────


@dataclass
class FileBackend:
    """Read full file contents (Docker swarm secrets, k8s mounted volumes).

    Path conventions:

    * ``file:///etc/secrets/db_url``  →  reads ``/etc/secrets/db_url``
    * ``file://relative/path``        →  reads ``./relative/path`` (resolved
      relative to ``cwd`` at call time)

    Trailing newlines are stripped to match the convention of ``echo``-ed
    secrets.
    """

    scheme: str = "file"

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        # Triple-slash form gives an absolute path with leading slash retained.
        if path.startswith("/"):
            target = Path(path)
        else:
            target = Path(path)
        try:
            return target.read_text(encoding="utf-8").rstrip("\n")
        except FileNotFoundError:
            return None
        except PermissionError as exc:  # pragma: no cover — env-specific
            raise SecretBackendError(f"Cannot read secret file {target}: {exc}") from exc


# ── vault:// ────────────────────────────────────────────────────────────────


@dataclass
class VaultBackend:
    """HashiCorp Vault KV-v2.

    Path syntax: ``vault://<mount>/data/<path>#<field>``. Examples:

    * ``vault://secret/data/platform/db#password``
    * ``vault://kv/data/api/keys#openai``

    Connection inputs (read once at construction):

    * ``VAULT_ADDR`` — base URL, e.g. ``https://vault.internal:8200``
    * ``VAULT_TOKEN`` — bearer token (most deployments inject via sidecar)
    * ``VAULT_NAMESPACE`` — optional, for Vault Enterprise

    Failures during ``__init__`` are deferred — the client is built lazily
    inside ``get`` so importing the module on a host without ``hvac``
    installed (e.g. dev) never crashes.
    """

    scheme: str = "vault"
    addr: Optional[str] = None
    token: Optional[str] = None
    namespace: Optional[str] = None
    cache_ttl: float = 30.0

    _client: Any = field(default=None, init=False, repr=False)
    _client_lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)
    _cache: Dict[str, Tuple[float, Optional[str]]] = field(default_factory=dict, init=False, repr=False)

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        with self._client_lock:
            if self._client is not None:
                return self._client
            try:
                import hvac  # type: ignore
            except ImportError as exc:
                raise SecretBackendError(
                    "Vault backend requires `hvac`. Install with "
                    "`pip install platform-secrets[vault]`."
                ) from exc
            addr = self.addr or os.environ.get("VAULT_ADDR")
            token = self.token or os.environ.get("VAULT_TOKEN")
            namespace = self.namespace or os.environ.get("VAULT_NAMESPACE")
            if not addr or not token:
                raise SecretBackendError(
                    "Vault backend requires VAULT_ADDR and VAULT_TOKEN."
                )
            client = hvac.Client(url=addr, token=token, namespace=namespace)
            if not client.is_authenticated():  # pragma: no cover — network
                raise SecretBackendError("Vault token rejected by server.")
            self._client = client
            return client

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        if not no_cache:
            hit, cached = _ttl_cache_get(self._cache, path, self.cache_ttl)
            if hit:
                return cached
        # Split off the optional ``#field`` component.
        ref_path, _, field_name = path.partition("#")
        client = self._get_client()
        # KV-v2 paths look like ``<mount>/data/<key>``. Strip the ``data/``
        # segment because hvac.kv.v2.read_secret_version takes the logical
        # path, e.g. ``platform/db``.
        mount, _, sub = ref_path.partition("/")
        if sub.startswith("data/"):
            sub = sub[len("data/") :]
        try:
            response = client.secrets.kv.v2.read_secret_version(
                mount_point=mount, path=sub, raise_on_deleted_version=False
            )
        except Exception as exc:  # pragma: no cover — network
            raise SecretBackendError(f"Vault read failed for {path!r}: {exc}") from exc
        data = response.get("data", {}).get("data") or {}
        if field_name:
            value = data.get(field_name)
        elif len(data) == 1:
            # Convenience: if no field requested and only one key exists,
            # return it. Common for single-string secrets.
            value = next(iter(data.values()))
        else:
            value = None
        if isinstance(value, (int, float, bool)):
            value = str(value)
        _ttl_cache_set(self._cache, path, value, self.cache_ttl)
        return value


# ── awssm:// ────────────────────────────────────────────────────────────────


@dataclass
class AwsSecretsManagerBackend:
    """AWS Secrets Manager.

    Path syntax: ``awssm://<arn-or-name>[#<json-field>]``.

    * If the secret is plain text, the body is returned as-is.
    * If the secret is JSON and ``#<json-field>`` is supplied, that field
      is extracted.
    * If the secret is JSON and no field is supplied, the raw JSON string
      is returned.
    """

    scheme: str = "awssm"
    region: Optional[str] = None
    cache_ttl: float = 60.0

    _client: Any = field(default=None, init=False, repr=False)
    _client_lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)
    _cache: Dict[str, Tuple[float, Optional[str]]] = field(default_factory=dict, init=False, repr=False)

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        with self._client_lock:
            if self._client is not None:
                return self._client
            try:
                import boto3  # type: ignore
            except ImportError as exc:
                raise SecretBackendError(
                    "AWS Secrets Manager backend requires `boto3`. Install "
                    "with `pip install platform-secrets[aws]`."
                ) from exc
            region = self.region or os.environ.get("AWS_REGION") or os.environ.get(
                "AWS_DEFAULT_REGION"
            )
            self._client = boto3.client("secretsmanager", region_name=region)
            return self._client

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        if not no_cache:
            hit, cached = _ttl_cache_get(self._cache, path, self.cache_ttl)
            if hit:
                return cached
        ref, _, field_name = path.partition("#")
        client = self._get_client()
        try:
            response = client.get_secret_value(SecretId=ref)
        except client.exceptions.ResourceNotFoundException:  # pragma: no cover
            return None
        except Exception as exc:  # pragma: no cover — network
            raise SecretBackendError(f"AWS SM read failed for {path!r}: {exc}") from exc
        body = response.get("SecretString")
        if body is None:
            # Binary secret — uncommon; punt to caller.
            value = None
        elif field_name:
            import json

            try:
                parsed = json.loads(body)
            except json.JSONDecodeError as exc:
                raise SecretBackendError(
                    f"AWS SM secret {ref!r} not JSON; cannot extract field {field_name!r}"
                ) from exc
            value = parsed.get(field_name)
            if value is not None and not isinstance(value, str):
                value = str(value)
        else:
            value = body
        _ttl_cache_set(self._cache, path, value, self.cache_ttl)
        return value


# ── gcpsm:// ────────────────────────────────────────────────────────────────


@dataclass
class GcpSecretManagerBackend:
    """GCP Secret Manager.

    Path syntax: ``gcpsm://projects/<project>/secrets/<name>/versions/<v>``.
    The ``<v>`` suffix is the version (e.g. ``latest`` or a numeric id).
    """

    scheme: str = "gcpsm"
    cache_ttl: float = 60.0

    _client: Any = field(default=None, init=False, repr=False)
    _client_lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)
    _cache: Dict[str, Tuple[float, Optional[str]]] = field(default_factory=dict, init=False, repr=False)

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        with self._client_lock:
            if self._client is not None:
                return self._client
            try:
                from google.cloud import secretmanager  # type: ignore
            except ImportError as exc:
                raise SecretBackendError(
                    "GCP Secret Manager backend requires "
                    "`google-cloud-secret-manager`. Install with "
                    "`pip install platform-secrets[gcp]`."
                ) from exc
            self._client = secretmanager.SecretManagerServiceClient()
            return self._client

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        if not no_cache:
            hit, cached = _ttl_cache_get(self._cache, path, self.cache_ttl)
            if hit:
                return cached
        client = self._get_client()
        try:
            response = client.access_secret_version(request={"name": path})
        except Exception as exc:  # pragma: no cover — network
            # google.api_core.exceptions.NotFound has class name NotFound
            if exc.__class__.__name__ == "NotFound":
                return None
            raise SecretBackendError(f"GCP SM read failed for {path!r}: {exc}") from exc
        payload = response.payload.data
        value = payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else str(payload)
        _ttl_cache_set(self._cache, path, value, self.cache_ttl)
        return value
