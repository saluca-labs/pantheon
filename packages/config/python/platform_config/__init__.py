"""
platform_config — Pydantic Settings-based env validation for Python services.

Usage:
    from platform_config import settings

    print(settings.DATABASE_URL)

The module-level ``settings`` attribute is resolved lazily via PEP 562
``__getattr__`` so that ``import platform_config`` succeeds even when the
required environment variables (DATABASE_URL, SESSION_SECRET, etc.) are
missing. ``Settings`` is only constructed (and validated) on first
attribute access.
"""

from typing import TYPE_CHECKING

from .settings import Settings, get_settings

# When CPython processes ``from .settings import ...`` it first imports
# the submodule ``platform_config.settings`` and, per PEP 328 §5,
# binds it as an attribute on the parent package — i.e. the name
# ``settings`` ends up in this module's globals pointing at the
# *submodule*, not the lazily-built Settings instance.
#
# PEP 562 ``__getattr__`` (defined below) only fires for names NOT in
# the module dict. So we must DROP the auto-bound submodule from
# globals; otherwise attribute access stops at the submodule and never
# reaches our lazy accessor.
#
# DO NOT "simplify" this by removing the assert + del pair. The assert
# is a tripwire: if a future CPython release changes this binding
# behavior, the test suite (see tests/test_lazy_settings.py) catches
# the silent regression rather than letting users hit
# AttributeError-by-shadowing at runtime.
import sys as _sys

_settings_module = _sys.modules[f"{__name__}.settings"]
assert (
    "settings" in globals() and globals()["settings"] is _settings_module
), "Expected submodule auto-binding to set globals()['settings']; CPython behavior changed?"
del globals()["settings"]


if TYPE_CHECKING:
    # Static analyzers (mypy, pyright, IDE autocomplete) cannot follow
    # the PEP 562 lazy ``__getattr__``. This block exposes the runtime
    # shape so ``platform_config.settings`` resolves to ``Settings``.
    settings: Settings  # populated lazily by __getattr__ below


def __getattr__(name: str):
    if name == "settings":
        return get_settings()
    if name == "settings_module":
        return _settings_module
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["Settings", "settings", "get_settings"]
