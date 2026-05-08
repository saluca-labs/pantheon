"""Configuration loading tests.

License: Apache-2.0.
"""

from __future__ import annotations

import pytest

from matrix_bridge.config import AppserviceConfig


def test_from_env_requires_tokens() -> None:
    with pytest.raises(RuntimeError, match="HS_TOKEN and AS_TOKEN"):
        AppserviceConfig.from_env(env={})


def test_from_env_requires_hs_token() -> None:
    with pytest.raises(RuntimeError):
        AppserviceConfig.from_env(env={"AS_TOKEN": "x"})


def test_from_env_requires_as_token() -> None:
    with pytest.raises(RuntimeError):
        AppserviceConfig.from_env(env={"HS_TOKEN": "x"})


def test_from_env_with_minimal_tokens() -> None:
    cfg = AppserviceConfig.from_env(
        env={"HS_TOKEN": "hs", "AS_TOKEN": "as"}
    )
    assert cfg.hs_token == "hs"
    assert cfg.as_token == "as"
    assert cfg.synapse_url == "http://synapse:8008"  # default
    assert cfg.soulwatch_url is None
    assert cfg.platform_api_url is None


def test_from_env_overrides() -> None:
    cfg = AppserviceConfig.from_env(
        env={
            "HS_TOKEN": "hs",
            "AS_TOKEN": "as",
            "SYNAPSE_URL": "http://other:9000",
            "SOULWATCH_INGEST_URL": "http://soulwatch:8000/ingest/matrix",
            "PLATFORM_API_URL": "http://platform-api:8000",
        }
    )
    assert cfg.synapse_url == "http://other:9000"
    assert cfg.soulwatch_url == "http://soulwatch:8000/ingest/matrix"
    assert cfg.platform_api_url == "http://platform-api:8000"


# ─── PR G hardening fields ──────────────────────────────────────────────────────


def test_transaction_max_bytes_defaults_to_5_MiB() -> None:
    cfg = AppserviceConfig.from_env(env={"HS_TOKEN": "hs", "AS_TOKEN": "as"})
    assert cfg.transaction_max_bytes == 5 * 1024 * 1024


def test_transaction_max_bytes_override() -> None:
    cfg = AppserviceConfig.from_env(
        env={
            "HS_TOKEN": "hs",
            "AS_TOKEN": "as",
            "MATRIX_TRANSACTION_MAX_BYTES": "1024",
        }
    )
    assert cfg.transaction_max_bytes == 1024


@pytest.mark.parametrize("bad", ["abc", "-5", ""])
def test_transaction_max_bytes_falls_back_on_garbage(bad: str) -> None:
    cfg = AppserviceConfig.from_env(
        env={
            "HS_TOKEN": "hs",
            "AS_TOKEN": "as",
            "MATRIX_TRANSACTION_MAX_BYTES": bad,
        }
    )
    assert cfg.transaction_max_bytes == 5 * 1024 * 1024


def test_sender_allowlist_defaults_enabled() -> None:
    cfg = AppserviceConfig.from_env(env={"HS_TOKEN": "hs", "AS_TOKEN": "as"})
    assert cfg.sender_allowlist_enabled is True


def test_sender_allowlist_disable_via_env() -> None:
    cfg = AppserviceConfig.from_env(
        env={
            "HS_TOKEN": "hs",
            "AS_TOKEN": "as",
            "MATRIX_SENDER_ALLOWLIST_DISABLED": "1",
        }
    )
    assert cfg.sender_allowlist_enabled is False
