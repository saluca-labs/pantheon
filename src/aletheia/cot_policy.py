"""
CoT Policy schema and loader.
Loads CotPolicy definitions from YAML files in the policies/cot/ directory.
Supports hot-reload via reload from disk.
"""

import os
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Optional

import structlog
import yaml

logger = structlog.get_logger(__name__)


@dataclass
class ProviderInjection:
    """Provider-specific thinking/reasoning injection config."""
    inject_field: str       # e.g., "thinking.enabled" for Anthropic
    inject_value: Any       # e.g., True
    budget_tokens: int = 10000  # max thinking budget to inject


@dataclass
class ExemptionRule:
    """Pattern-based exemption from CoT policy enforcement."""
    model_pattern: Optional[str] = None       # e.g., "claude-3-5-haiku*"
    endpoint_pattern: Optional[str] = None    # e.g., "/v1/embeddings"
    agent_pattern: Optional[str] = None       # e.g., "linter-*"


@dataclass
class CotPolicy:
    """A CoT enforcement policy defining when and how to require thinking."""
    name: str
    require_thinking: bool = True
    enforcement: str = "inject"  # "inject" | "reject" | "warn"
    providers: dict[str, ProviderInjection] = field(default_factory=dict)
    exemptions: list[ExemptionRule] = field(default_factory=list)
    enabled: bool = True


def load_cot_policy(policy_path: str) -> Optional[CotPolicy]:
    """Parse a single YAML policy file into a CotPolicy.

    Validates apiVersion and kind fields before parsing.
    Returns None if file is invalid or not a CotPolicy.
    """
    try:
        with open(policy_path, "r") as f:
            doc = yaml.safe_load(f)

        if not isinstance(doc, dict):
            logger.warning("cot_policy.invalid_document", path=policy_path)
            return None

        if doc.get("apiVersion") != "tiresias/v1":
            logger.warning("cot_policy.wrong_api_version", path=policy_path, version=doc.get("apiVersion"))
            return None

        if doc.get("kind") != "CotPolicy":
            logger.warning("cot_policy.wrong_kind", path=policy_path, kind=doc.get("kind"))
            return None

        metadata = doc.get("metadata", {})
        spec = doc.get("spec", {})

        # Parse provider injections
        providers: dict[str, ProviderInjection] = {}
        for prov_name, prov_cfg in spec.get("providers", {}).items():
            if isinstance(prov_cfg, dict):
                providers[prov_name] = ProviderInjection(
                    inject_field=prov_cfg.get("inject_field", ""),
                    inject_value=prov_cfg.get("inject_value"),
                    budget_tokens=prov_cfg.get("budget_tokens", 10000),
                )

        # Parse exemptions
        exemptions: list[ExemptionRule] = []
        for exempt_cfg in spec.get("exempt", []):
            if isinstance(exempt_cfg, dict):
                exemptions.append(ExemptionRule(
                    model_pattern=exempt_cfg.get("model_pattern"),
                    endpoint_pattern=exempt_cfg.get("endpoint_pattern"),
                    agent_pattern=exempt_cfg.get("agent_pattern"),
                ))

        return CotPolicy(
            name=metadata.get("name", Path(policy_path).stem),
            require_thinking=spec.get("require_thinking", True),
            enforcement=spec.get("enforcement", "inject"),
            providers=providers,
            exemptions=exemptions,
            enabled=spec.get("enabled", True),
        )

    except Exception as e:
        logger.error("cot_policy.load_error", path=policy_path, error=str(e))
        return None


def load_cot_policies_from_dir(dir_path: str = "policies/cot") -> list[CotPolicy]:
    """Load all enabled CotPolicy YAML files from a directory.

    Returns list of enabled policies. Skips invalid or disabled ones.
    """
    policies: list[CotPolicy] = []
    policy_dir = Path(dir_path)

    if not policy_dir.is_dir():
        logger.info("cot_policy.dir_not_found", dir=dir_path)
        return policies

    for yaml_file in sorted(policy_dir.glob("*.yaml")):
        policy = load_cot_policy(str(yaml_file))
        if policy and policy.enabled:
            policies.append(policy)
            logger.debug("cot_policy.loaded", name=policy.name, enforcement=policy.enforcement)

    logger.info("cot_policy.loaded_all", count=len(policies), dir=dir_path)
    return policies


def check_exemption(
    policy: CotPolicy,
    model: str,
    endpoint: str,
    agent_id: Optional[str] = None,
) -> bool:
    """Check if a request matches any exemption rule in the policy.

    Uses fnmatch for glob-style pattern matching.
    Returns True if the request is exempt (policy should NOT apply).
    """
    for rule in policy.exemptions:
        if rule.model_pattern and fnmatch(model, rule.model_pattern):
            return True
        if rule.endpoint_pattern and fnmatch(endpoint, rule.endpoint_pattern):
            return True
        if rule.agent_pattern and agent_id and fnmatch(agent_id, rule.agent_pattern):
            return True
    return False
