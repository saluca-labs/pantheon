"""Tests for the secrets facade."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import pytest

from platform_secrets import (
    SecretBackendError,
    SecretNotFoundError,
    SecretReferenceError,
    SecretsFacade,
    configure,
    get_facade,
    is_secret_reference,
    resolve,
    resolve_mapping,
)
from platform_secrets.facade import _split_reference


@dataclass
class _StubBackend:
    scheme: str = "stub"
    values: dict = None  # type: ignore[assignment]
    calls: list = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.values is None:
            self.values = {}
        if self.calls is None:
            self.calls = []

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        self.calls.append((path, no_cache))
        return self.values.get(path)


# ── is_secret_reference ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "value,expected",
    [
        ("vault://foo", True),
        ("env://DATABASE_URL", True),
        ("file:///etc/secret", True),
        ("awssm://arn:aws:...#field", True),
        ("plaintext", False),
        # Note: ``https://`` is technically valid scheme syntax — the facade
        # accepts any lowercase alnum scheme so apps can register custom
        # ones. Callers wanting to filter URLs from refs should use the
        # explicit ``_DEFAULT_FACTORIES`` list.
        ("", False),
        ("://no-scheme", False),
        (None, False),
    ],
)
def test_is_secret_reference(value, expected):
    assert is_secret_reference(value) is expected


def test_split_reference_rejects_non_references():
    with pytest.raises(SecretReferenceError):
        _split_reference("not-a-reference")


# ── SecretsFacade ───────────────────────────────────────────────────────────


def test_facade_resolves_via_registered_backend():
    facade = SecretsFacade()
    backend = _StubBackend(scheme="env", values={"FOO": "bar"})
    facade.register(backend)
    assert facade.resolve("env://FOO") == "bar"
    assert backend.calls == [("FOO", False)]


def test_facade_returns_default_when_missing():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={}))
    assert facade.resolve("env://MISSING", default="fallback") == "fallback"


def test_facade_returns_none_when_missing_no_default():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={}))
    assert facade.resolve("env://MISSING") is None


def test_facade_unknown_scheme_raises():
    facade = SecretsFacade()
    with pytest.raises(SecretReferenceError, match="Unknown secret backend"):
        facade.resolve("nopenope://foo")


def test_facade_passes_no_cache_to_backend():
    facade = SecretsFacade()
    backend = _StubBackend(scheme="env", values={"FOO": "bar"})
    facade.register(backend)
    facade.resolve("env://FOO", no_cache=True)
    assert backend.calls[-1] == ("FOO", True)


def test_facade_resolve_required_raises_when_missing():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={}))
    with pytest.raises(SecretNotFoundError):
        facade.resolve_required("env://MISSING")


def test_facade_resolve_required_returns_value_on_hit():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={"X": "y"}))
    assert facade.resolve_required("env://X") == "y"


def test_facade_legacy_bare_name_uses_environ(monkeypatch):
    facade = SecretsFacade()
    monkeypatch.setenv("LEGACY_VAR", "from-env")
    assert facade.resolve("LEGACY_VAR") == "from-env"


def test_facade_legacy_bare_name_returns_literal_when_unset(monkeypatch):
    facade = SecretsFacade()
    monkeypatch.delenv("UNSET_VAR", raising=False)
    # Legacy contract: when not in env, returns the input unchanged.
    assert facade.resolve("UNSET_VAR") == "UNSET_VAR"


def test_facade_resolve_mapping_resolves_each_value():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={"A": "1", "B": "2"}))
    out = facade.resolve_mapping({"first": "env://A", "second": "env://B"})
    assert out == {"first": "1", "second": "2"}


def test_facade_resolve_mapping_passes_through_literals():
    facade = SecretsFacade()
    facade.register(_StubBackend(scheme="env", values={}))
    assert facade.resolve_mapping({"x": "literal"}) == {"x": "literal"}


def test_facade_non_string_values_pass_through():
    facade = SecretsFacade()
    assert facade.resolve(None) is None  # type: ignore[arg-type]
    assert facade.resolve(42) == 42  # type: ignore[arg-type]


# ── Module-level singleton ──────────────────────────────────────────────────


def test_get_facade_returns_singleton():
    a = get_facade()
    b = get_facade()
    assert a is b


def test_configure_registers_backend_on_singleton():
    backend = _StubBackend(scheme="stub", values={"k": "v"})
    facade = configure(backend)
    assert facade.backends["stub"] is backend
    # Direct module-level resolve sees the registered backend.
    assert resolve("stub://k") == "v"


def test_module_resolve_mapping_is_thin_wrapper():
    backend = _StubBackend(scheme="stub", values={"x": "1", "y": "2"})
    configure(backend)
    out = resolve_mapping({"a": "stub://x", "b": "stub://y"})
    assert out == {"a": "1", "b": "2"}
