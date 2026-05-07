"""
CoT policy enforcer.
Evaluates request bodies against CotPolicy rules and performs
injection, rejection, or warning based on enforcement mode.
"""

import copy
from dataclasses import dataclass
from typing import Any, Optional

import structlog

from src.aletheia.cot_policy import (
    CotPolicy,
    check_exemption,
    load_cot_policies_from_dir,
)

logger = structlog.get_logger(__name__)


@dataclass
class CotEnforcementResult:
    """Result of evaluating a request against CoT policies."""
    action: str              # "pass" | "inject" | "reject" | "warn" | "exempt"
    modified_body: Optional[dict] = None  # Modified request body (only for "inject")
    policy_name: Optional[str] = None
    reason: str = ""
    cost_injected: bool = False  # True if thinking was injected (for cost attribution)


class CotEnforcer:
    """Evaluates requests against a set of CotPolicy rules."""

    def __init__(self, policies: list[CotPolicy]):
        self.policies = policies

    def evaluate(
        self,
        provider: str,
        body: dict,
        model: str,
        endpoint: str,
        agent_id: Optional[str] = None,
    ) -> CotEnforcementResult:
        """Evaluate a request body against all active policies.

        Checks exemptions, detects existing thinking, then applies
        the enforcement mode (inject/reject/warn).
        """
        for policy in self.policies:
            if not policy.enabled or not policy.require_thinking:
                continue

            # Check exemptions first
            if check_exemption(policy, model, endpoint, agent_id):
                return CotEnforcementResult(
                    action="exempt",
                    policy_name=policy.name,
                    reason=f"Request exempt from policy {policy.name}",
                )

            # Check if request already has thinking enabled
            if self._has_thinking(provider, body):
                return CotEnforcementResult(
                    action="pass",
                    policy_name=policy.name,
                    reason="Request already has thinking enabled",
                )

            # Apply enforcement mode
            if policy.enforcement == "inject":
                return self._do_inject(provider, body, policy)
            elif policy.enforcement == "reject":
                return CotEnforcementResult(
                    action="reject",
                    policy_name=policy.name,
                    reason="cot-policy-violation",
                )
            elif policy.enforcement == "warn":
                return CotEnforcementResult(
                    action="warn",
                    policy_name=policy.name,
                    reason=f"CoT policy {policy.name} violation (warn mode)",
                )

        # No policy matched or all disabled
        return CotEnforcementResult(action="pass", reason="No active CoT policy applies")

    def _has_thinking(self, provider: str, body: dict) -> bool:
        """Check if the request already has thinking/reasoning enabled."""
        if provider == "anthropic":
            thinking = body.get("thinking", {})
            if isinstance(thinking, dict) and thinking.get("enabled") is True:
                return True
            # Also check type-based format
            if isinstance(thinking, dict) and thinking.get("type") == "enabled":
                return True

        elif provider == "openai":
            if body.get("reasoning_effort") is not None:
                return True

        elif provider == "gemini":
            gen_config = body.get("generationConfig", {})
            if isinstance(gen_config, dict):
                thinking_config = gen_config.get("thinkingConfig", {})
                if isinstance(thinking_config, dict):
                    budget = thinking_config.get("thinkingBudget", 0)
                    if budget and budget > 0:
                        return True

        return False

    def _do_inject(self, provider: str, body: dict, policy: CotPolicy) -> CotEnforcementResult:
        """Inject thinking fields into the request body based on provider."""
        injection = policy.providers.get(provider)
        if not injection:
            # No injection config for this provider; warn instead of failing
            logger.warning(
                "cot_enforcer.no_provider_config",
                provider=provider,
                policy=policy.name,
            )
            return CotEnforcementResult(
                action="warn",
                policy_name=policy.name,
                reason=f"No injection config for provider {provider} in policy {policy.name}",
            )

        modified = copy.deepcopy(body)

        if provider == "anthropic":
            modified = self._inject_anthropic(modified, injection)
        elif provider == "openai":
            modified = self._inject_openai(modified, injection)
        elif provider == "gemini":
            modified = self._inject_gemini(modified, injection)
        else:
            # Unknown provider, cannot inject
            return CotEnforcementResult(
                action="warn",
                policy_name=policy.name,
                reason=f"Cannot inject thinking for unknown provider {provider}",
            )

        return CotEnforcementResult(
            action="inject",
            modified_body=modified,
            policy_name=policy.name,
            reason=f"Thinking injected by policy {policy.name}",
            cost_injected=True,
        )

    @staticmethod
    def _inject_anthropic(body: dict, injection: Any) -> dict:
        """Set Anthropic thinking block: thinking.type=enabled, budget_tokens."""
        body["thinking"] = {
            "type": "enabled",
            "budget_tokens": injection.budget_tokens,
        }
        return body

    @staticmethod
    def _inject_openai(body: dict, injection: Any) -> dict:
        """Set OpenAI reasoning_effort field."""
        body["reasoning_effort"] = injection.inject_value
        return body

    @staticmethod
    def _inject_gemini(body: dict, injection: Any) -> dict:
        """Set Gemini generationConfig.thinkingConfig.thinkingBudget."""
        if "generationConfig" not in body:
            body["generationConfig"] = {}
        body["generationConfig"]["thinkingConfig"] = {
            "thinkingBudget": injection.budget_tokens,
        }
        return body


# === Module-level singleton for hot-reload ===

_active_enforcer: Optional[CotEnforcer] = None


def init_cot_enforcer(policy_dir: str = "policies/cot") -> None:
    """Load policies and initialize the enforcer singleton."""
    global _active_enforcer
    policies = load_cot_policies_from_dir(policy_dir)
    if policies:
        _active_enforcer = CotEnforcer(policies)
        logger.info("cot_enforcer.initialized", policy_count=len(policies))
    else:
        _active_enforcer = None
        logger.info("cot_enforcer.no_policies")


def get_active_enforcer() -> Optional[CotEnforcer]:
    """Get the active enforcer singleton (None if not initialized)."""
    return _active_enforcer


def reload_cot_policies(policy_dir: str = "policies/cot") -> None:
    """Hot-reload policies from disk. Thread-safe via GIL assignment."""
    init_cot_enforcer(policy_dir)
