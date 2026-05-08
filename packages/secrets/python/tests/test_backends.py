"""Tests for the concrete secret backends.

Vault / AWS / GCP rely on optional SDK dependencies; those tests use
mock-based fakes so the suite can run on a bare CI image.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from platform_secrets.backends import (
    AwsSecretsManagerBackend,
    EnvBackend,
    FileBackend,
    GcpSecretManagerBackend,
    VaultBackend,
)
from platform_secrets.errors import SecretBackendError


# ── EnvBackend ──────────────────────────────────────────────────────────────


def test_env_backend_returns_value(monkeypatch):
    monkeypatch.setenv("MY_VAR", "hello")
    assert EnvBackend().get("MY_VAR") == "hello"


def test_env_backend_returns_none_when_missing(monkeypatch):
    monkeypatch.delenv("MISSING_VAR", raising=False)
    assert EnvBackend().get("MISSING_VAR") is None


# ── FileBackend ─────────────────────────────────────────────────────────────


def test_file_backend_reads_absolute_path(tmp_path: Path):
    secret = tmp_path / "secret"
    secret.write_text("super-secret\n")
    assert FileBackend().get(str(secret)) == "super-secret"


def test_file_backend_strips_trailing_newlines(tmp_path: Path):
    secret = tmp_path / "secret"
    secret.write_text("value\n\n")
    # Only the final newline is stripped (single rstrip("\n") strips all
    # trailing newlines, which matches conventional `echo` behaviour).
    assert FileBackend().get(str(secret)) == "value"


def test_file_backend_returns_none_when_missing(tmp_path: Path):
    assert FileBackend().get(str(tmp_path / "absent")) is None


# ── VaultBackend ────────────────────────────────────────────────────────────


class _FakeKVv2:
    def __init__(self, store: dict[tuple[str, str], dict]) -> None:
        self.store = store
        self.calls: list[tuple[str, str]] = []

    def read_secret_version(self, *, mount_point: str, path: str, **_: Any) -> dict:
        self.calls.append((mount_point, path))
        data = self.store.get((mount_point, path))
        if data is None:
            return {"data": {"data": {}}}
        return {"data": {"data": data}}


class _FakeSecretsAPI:
    def __init__(self, kv):
        self.kv = kv

    @property
    def v2(self):  # mimic the actual hvac shape: client.secrets.kv.v2
        # Note: the real hvac path is ``client.secrets.kv.v2.read_secret_version``.
        # The backend code calls ``client.secrets.kv.v2.read_secret_version(...)``
        # so we expose a ``kv`` attribute below.
        return self.kv


class _FakeKVAdapter:
    """Mimics hvac's ``client.secrets.kv`` namespace where ``.v2`` exists."""

    def __init__(self, kv):
        self.v2 = kv


class _FakeVaultSecrets:
    def __init__(self, kv):
        self.kv = _FakeKVAdapter(kv)


class _FakeVaultClient:
    def __init__(self, store: dict[tuple[str, str], dict]) -> None:
        self.kv = _FakeKVv2(store)
        self.secrets = _FakeVaultSecrets(self.kv)

    def is_authenticated(self) -> bool:
        return True


def _patch_hvac(monkeypatch, store):
    fake = _FakeVaultClient(store)

    class _FakeHvac:
        @staticmethod
        def Client(*, url, token, namespace=None):  # noqa: N802
            return fake

    monkeypatch.setitem(__import__("sys").modules, "hvac", _FakeHvac)
    return fake


def test_vault_backend_reads_field(monkeypatch):
    fake = _patch_hvac(
        monkeypatch,
        {("secret", "platform/db"): {"password": "pg-pass", "username": "pg"}},
    )
    monkeypatch.setenv("VAULT_ADDR", "http://localhost:8200")
    monkeypatch.setenv("VAULT_TOKEN", "dev-root")
    backend = VaultBackend()
    assert backend.get("secret/data/platform/db#password") == "pg-pass"
    assert fake.kv.calls == [("secret", "platform/db")]


def test_vault_backend_single_value_no_field(monkeypatch):
    _patch_hvac(monkeypatch, {("secret", "api/key"): {"value": "abc123"}})
    monkeypatch.setenv("VAULT_ADDR", "http://localhost:8200")
    monkeypatch.setenv("VAULT_TOKEN", "dev-root")
    assert VaultBackend().get("secret/data/api/key") == "abc123"


def test_vault_backend_returns_none_when_missing(monkeypatch):
    _patch_hvac(monkeypatch, {})
    monkeypatch.setenv("VAULT_ADDR", "http://localhost:8200")
    monkeypatch.setenv("VAULT_TOKEN", "dev-root")
    assert VaultBackend().get("secret/data/missing#x") is None


def test_vault_backend_caches_within_ttl(monkeypatch):
    fake = _patch_hvac(
        monkeypatch, {("secret", "x"): {"value": "v"}}
    )
    monkeypatch.setenv("VAULT_ADDR", "http://localhost:8200")
    monkeypatch.setenv("VAULT_TOKEN", "dev-root")
    backend = VaultBackend()
    backend.get("secret/data/x")
    backend.get("secret/data/x")
    assert len(fake.kv.calls) == 1


def test_vault_backend_no_cache_bypasses(monkeypatch):
    fake = _patch_hvac(
        monkeypatch, {("secret", "x"): {"value": "v"}}
    )
    monkeypatch.setenv("VAULT_ADDR", "http://localhost:8200")
    monkeypatch.setenv("VAULT_TOKEN", "dev-root")
    backend = VaultBackend()
    backend.get("secret/data/x")
    backend.get("secret/data/x", no_cache=True)
    assert len(fake.kv.calls) == 2


def test_vault_backend_requires_addr_and_token(monkeypatch):
    monkeypatch.delenv("VAULT_ADDR", raising=False)
    monkeypatch.delenv("VAULT_TOKEN", raising=False)
    _patch_hvac(monkeypatch, {})
    with pytest.raises(SecretBackendError, match="VAULT_ADDR"):
        VaultBackend().get("secret/data/x")


def test_vault_backend_missing_hvac_raises(monkeypatch):
    # Simulate hvac not installed.
    import sys

    monkeypatch.setitem(sys.modules, "hvac", None)
    with pytest.raises(SecretBackendError, match="hvac"):
        VaultBackend().get("secret/data/x")


# ── AwsSecretsManagerBackend ────────────────────────────────────────────────


class _FakeBoto3Client:
    def __init__(self, secrets):
        self._secrets = secrets

        class _NotFound(Exception):
            pass

        class _Exceptions:
            ResourceNotFoundException = _NotFound

        self.exceptions = _Exceptions()
        self.calls = []

    def get_secret_value(self, *, SecretId):  # noqa: N803
        self.calls.append(SecretId)
        if SecretId not in self._secrets:
            raise self.exceptions.ResourceNotFoundException(SecretId)
        return {"SecretString": self._secrets[SecretId]}


def _patch_boto3(monkeypatch, secrets):
    client = _FakeBoto3Client(secrets)

    class _FakeBoto3:
        @staticmethod
        def client(name, region_name=None):
            assert name == "secretsmanager"
            return client

    monkeypatch.setitem(__import__("sys").modules, "boto3", _FakeBoto3)
    return client


def test_aws_backend_returns_plain_secret(monkeypatch):
    _patch_boto3(monkeypatch, {"db-url": "postgres://prod"})
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    assert AwsSecretsManagerBackend().get("db-url") == "postgres://prod"


def test_aws_backend_extracts_json_field(monkeypatch):
    _patch_boto3(
        monkeypatch,
        {"creds": json.dumps({"username": "u", "password": "p"})},
    )
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    assert AwsSecretsManagerBackend().get("creds#password") == "p"


def test_aws_backend_returns_none_when_missing(monkeypatch):
    _patch_boto3(monkeypatch, {})
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    assert AwsSecretsManagerBackend().get("absent") is None


def test_aws_backend_field_on_non_json_raises(monkeypatch):
    _patch_boto3(monkeypatch, {"plain": "not-json"})
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    with pytest.raises(SecretBackendError, match="not JSON"):
        AwsSecretsManagerBackend().get("plain#field")


def test_aws_backend_missing_boto3_raises(monkeypatch):
    import sys

    monkeypatch.setitem(sys.modules, "boto3", None)
    with pytest.raises(SecretBackendError, match="boto3"):
        AwsSecretsManagerBackend().get("anything")


# ── GcpSecretManagerBackend ─────────────────────────────────────────────────


class _FakeGcpResponse:
    def __init__(self, payload: bytes):
        class _Payload:
            data = payload

        self.payload = _Payload()


class _FakeGcpClient:
    def __init__(self, secrets):
        self._secrets = secrets
        self.calls = []

    def access_secret_version(self, request):
        name = request["name"]
        self.calls.append(name)
        if name not in self._secrets:
            err = type("NotFound", (Exception,), {})(name)
            raise err
        return _FakeGcpResponse(self._secrets[name])


def _patch_gcp(monkeypatch, secrets):
    client = _FakeGcpClient(secrets)

    class _FakeSecretManager:
        @staticmethod
        def SecretManagerServiceClient():  # noqa: N802
            return client

    class _FakeCloud:
        secretmanager = _FakeSecretManager

    class _FakeGoogle:
        cloud = _FakeCloud

    import sys

    monkeypatch.setitem(sys.modules, "google", _FakeGoogle)
    monkeypatch.setitem(sys.modules, "google.cloud", _FakeCloud)
    monkeypatch.setitem(sys.modules, "google.cloud.secretmanager", _FakeSecretManager)
    return client


def test_gcp_backend_decodes_payload(monkeypatch):
    name = "projects/p/secrets/db/versions/latest"
    _patch_gcp(monkeypatch, {name: b"super-secret"})
    assert GcpSecretManagerBackend().get(name) == "super-secret"


def test_gcp_backend_returns_none_when_missing(monkeypatch):
    _patch_gcp(monkeypatch, {})
    assert GcpSecretManagerBackend().get("projects/p/secrets/x/versions/latest") is None


def test_gcp_backend_missing_sdk_raises(monkeypatch):
    import sys

    monkeypatch.setitem(sys.modules, "google.cloud.secretmanager", None)
    with pytest.raises(SecretBackendError, match="google-cloud-secret-manager"):
        GcpSecretManagerBackend().get("projects/p/secrets/x/versions/latest")
