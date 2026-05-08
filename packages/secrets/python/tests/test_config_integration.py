"""Integration test: the platform_config loader resolves secret refs.

This bridges the secrets facade and the existing settings module so a
deployment can put ``DATABASE_URL=vault://secret/data/db#url`` in its env
and the rest of the codebase keeps reading a plain Postgres URL.
"""

from __future__ import annotations

import importlib
import os
import sys

import pytest

from platform_secrets import configure
import platform_secrets.facade as facade_module


@pytest.fixture(autouse=True)
def reset_singleton(monkeypatch):
    """Each test gets a fresh facade so backends don't leak."""
    monkeypatch.setattr(facade_module, "_singleton", None)
    yield
    monkeypatch.setattr(facade_module, "_singleton", None)


@pytest.fixture(autouse=True)
def purge_platform_config(monkeypatch):
    """platform_config eagerly calls get_settings() at import time, so each
    test must reset its module cache before re-importing with fresh env."""
    for key in list(sys.modules):
        if key == "platform_config" or key.startswith("platform_config."):
            sys.modules.pop(key, None)
    yield
    for key in list(sys.modules):
        if key == "platform_config" or key.startswith("platform_config."):
            sys.modules.pop(key, None)


class _StubBackend:
    scheme = "stub"

    def __init__(self, values):
        self.values = values

    def get(self, path, *, no_cache=False):
        return self.values.get(path)


def _required_settings_env(monkeypatch):
    """Set the bare-minimum env vars so Settings() validates."""
    monkeypatch.setenv("DATABASE_URL", "postgres://localhost/db")
    monkeypatch.setenv("SESSION_SECRET", "x" * 40)
    monkeypatch.setenv("WEB_PUBLIC_URL", "http://localhost:3000")
    monkeypatch.setenv("API_PUBLIC_URL", "http://localhost:8000")


def test_config_loader_resolves_database_url_reference(monkeypatch):
    configure(_StubBackend({"db/url": "postgres://prod-host/proddb"}))
    _required_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "stub://db/url")

    settings_mod = importlib.import_module("platform_config.settings")
    settings_mod.get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = settings_mod.get_settings()
    assert settings.DATABASE_URL == "postgres://prod-host/proddb"


def test_config_loader_resolves_session_secret_reference(monkeypatch):
    long_value = "y" * 40
    configure(_StubBackend({"app/session": long_value}))
    _required_settings_env(monkeypatch)
    monkeypatch.setenv("SESSION_SECRET", "stub://app/session")

    settings_mod = importlib.import_module("platform_config.settings")
    settings_mod.get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = settings_mod.get_settings()
    assert settings.SESSION_SECRET == long_value


def test_config_loader_passes_through_literals(monkeypatch):
    _required_settings_env(monkeypatch)
    # No reference syntax — value is a literal Postgres URL.
    monkeypatch.setenv("DATABASE_URL", "postgres://literal/db")

    settings_mod = importlib.import_module("platform_config.settings")
    settings_mod.get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = settings_mod.get_settings()
    assert settings.DATABASE_URL == "postgres://literal/db"


def test_config_loader_unknown_scheme_passes_through(monkeypatch):
    """Unknown schemes are NOT treated as secret references.

    This ensures plain literals like ``postgres://...`` and
    ``redis://...`` are not accidentally routed to the secrets facade.
    """
    _required_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "postgres://literal-host/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    settings_mod = importlib.import_module("platform_config.settings")
    settings_mod.get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = settings_mod.get_settings()
    assert settings.DATABASE_URL == "postgres://literal-host/db"
    assert settings.REDIS_URL == "redis://localhost:6379/0"
