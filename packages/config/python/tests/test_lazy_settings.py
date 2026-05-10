"""Regress the import-time crash fixed by PEP 562 lazy __getattr__."""
import importlib
import sys


def _purge(monkeypatch):
    for k in list(sys.modules):
        if k == "platform_config" or k.startswith("platform_config."):
            sys.modules.pop(k, None)
    for v in ("DATABASE_URL", "SESSION_SECRET", "WEB_PUBLIC_URL", "API_PUBLIC_URL"):
        monkeypatch.delenv(v, raising=False)


def test_import_succeeds_without_required_env(monkeypatch):
    _purge(monkeypatch)
    mod = importlib.import_module("platform_config")
    assert hasattr(mod, "get_settings")


def test_settings_attribute_access_lazily_validates(monkeypatch):
    import pytest
    from pydantic import ValidationError

    _purge(monkeypatch)
    mod = importlib.import_module("platform_config")
    with pytest.raises(ValidationError):
        _ = mod.settings


def test_settings_attribute_access_succeeds_with_env(monkeypatch):
    _purge(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "postgres://localhost/db")
    monkeypatch.setenv("SESSION_SECRET", "x" * 40)
    monkeypatch.setenv("WEB_PUBLIC_URL", "http://localhost:3000")
    monkeypatch.setenv("API_PUBLIC_URL", "http://localhost:8000")
    mod = importlib.import_module("platform_config")
    assert mod.settings.DATABASE_URL == "postgres://localhost/db"
