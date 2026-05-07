"""
Module-level singleton for the PRH engine.
Follows the same pattern as src/detection/_state.py and src/analytics/_state.py.
Initialized during app lifespan (main.py), accessed by middleware, router, and sigma_bridge.
"""

from typing import Optional

from src.prh.analyzer import PRHAnalyzer

_analyzer: Optional[PRHAnalyzer] = None

# Default per-tenant config (overridden by /v1/prh/config endpoint)
_default_config: dict = {
    "enabled": True,
    "threshold": 0.5,
    "auto_quarantine_threshold": 0.85,
    "enabled_categories": [
        "injection",
        "jailbreak",
        "data_exfil",
        "pii_leak",
        "instruction_override",
        "role_manipulation",
    ],
}

# In-memory per-tenant config store: { tenant_id_str -> config_dict }
_tenant_configs: dict[str, dict] = {}


def init_prh(analyzer: Optional[PRHAnalyzer] = None) -> None:
    """Initialize PRH engine singleton. Creates default analyzer if none provided."""
    global _analyzer
    _analyzer = analyzer or PRHAnalyzer()


def get_prh_analyzer() -> PRHAnalyzer:
    """Return the active PRHAnalyzer singleton, creating a default if not initialized."""
    global _analyzer
    if _analyzer is None:
        _analyzer = PRHAnalyzer()
    return _analyzer


def get_tenant_config(tenant_id: str) -> dict:
    """Return the PRH config for a tenant, falling back to defaults."""
    return dict(_tenant_configs.get(tenant_id, _default_config))


def set_tenant_config(tenant_id: str, config: dict) -> dict:
    """
    Merge partial config update into tenant config.
    Returns the resulting full config.
    """
    current = get_tenant_config(tenant_id)
    current.update(config)
    _tenant_configs[tenant_id] = current
    return dict(current)


def reset_prh() -> None:
    """Clear global state (for testing)."""
    global _analyzer, _tenant_configs
    _analyzer = None
    _tenant_configs = {}
