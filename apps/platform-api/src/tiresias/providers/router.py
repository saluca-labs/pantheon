from __future__ import annotations

import fnmatch
import logging
from typing import Callable

import httpx

from .base import BaseProvider
from .health import HealthTracker

logger = logging.getLogger(__name__)

_PROVIDER_TIMEOUT = 120.0   # seconds per provider attempt

# ---------------------------------------------------------------------------
# Model-prefix → preferred provider map
# Pattern matching uses fnmatch glob syntax (case-insensitive).
# Order matters: first match wins.
# ---------------------------------------------------------------------------
_MODEL_PREFIX_MAP: list[tuple[str, str]] = [
    # OpenAI models
    ("gpt-*",   "openai"),
    ("text-*",  "openai"),
    ("o1-*",    "openai"),
    ("o3-*",    "openai"),
    ("o4-*",    "openai"),
    # Anthropic models
    ("claude-*", "anthropic"),
]
# Any model without a "/" that doesn't match the above list is assumed Ollama.
# Models with a "/" are handled by _detect_explicit_provider_prefix().


def _preferred_provider_for_model(model: str, cascade: list[str]) -> str | None:
    """Return the preferred provider name for *model* based on prefix rules.

    Returns None if the model is unrecognised (no prefix matches) so the caller
    can fall back to full-cascade with a WARNING.

    Does NOT handle the ``provider/model`` explicit-prefix syntax -- that is
    handled separately by ``_detect_explicit_provider_prefix``.
    """
    model_lower = model.lower()
    for pattern, provider in _MODEL_PREFIX_MAP:
        if fnmatch.fnmatch(model_lower, pattern):
            if provider in cascade:
                return provider
            # Preferred provider not in this cascade -- fall through to cascade
            return None
    # No pattern matched -- treat as Ollama if "ollama" is in cascade
    # (bare model names like "qwen3-coder:30b", "llama3.1:8b", "gemma2:9b")
    if "ollama" in cascade:
        return "ollama"
    return None


class ProviderCascadeExhausted(Exception):
    """Raised when all providers in the cascade have failed."""


class ProviderRouter:
    """Routes requests through a cascade of providers with automatic failover.

    Routing priority (highest to lowest):
    1. Explicit provider prefix in model name (``anthropic/claude-...``,
       ``openai/gpt-...``, ``ollama/qwen3-...``).  Pinned -- no cascade.
    2. Model-prefix map (``gpt-*`` → openai, ``claude-*`` → anthropic, bare
       names → ollama).  Preferred provider tried first; cascade on 5xx/429
       only.  4xx stops immediately and is returned to the caller.
    3. Unknown prefix → full cascade with ``unknown_model_prefix`` WARNING.
    """

    def __init__(
        self,
        cascade: list[str],
        health: HealthTracker,
        builder: Callable[[str], BaseProvider],
        http_client: httpx.AsyncClient,
    ) -> None:
        self._cascade = cascade
        self._health = health
        self._builder = builder
        self._http_client = http_client

    def _detect_explicit_provider_prefix(self, model: str) -> str | None:
        """If the model name has an explicit provider prefix (e.g. ``ollama/llama3.1:8b``),
        return the provider name when it is in our cascade. Otherwise None."""
        if "/" in model:
            prefix = model.split("/", 1)[0].lower()
            if prefix in self._cascade:
                return prefix
        return None

    def _build_ordered_providers(self, model: str) -> tuple[list[str], bool]:
        """Return (ordered_provider_list, is_pinned).

        is_pinned=True means no cascade fallback should occur (explicit prefix).
        is_pinned=False means cascade is allowed on 5xx/429.
        """
        # Priority 1: explicit ``provider/model`` prefix -- no cascade
        pinned = self._detect_explicit_provider_prefix(model)
        if pinned:
            return [pinned], True

        # Priority 2: model-prefix map -- preferred first, then remaining cascade
        preferred = _preferred_provider_for_model(model, self._cascade)
        if preferred is None:
            # Priority 3: unknown model -- full cascade, log warning
            logger.warning(
                "unknown_model_prefix model=%r -- falling back to full cascade", model
            )
            return self._health.get_ordered_providers(), False

        # Build cascade with preferred provider first, rest of health-ordered list after
        rest = [p for p in self._health.get_ordered_providers() if p != preferred]
        return [preferred] + rest, False

    async def execute(
        self,
        request_body: dict,
        extra_headers: dict,
    ) -> tuple[dict, str]:
        """Try providers in cascade order. Returns (normalized_response, provider_name).

        Routing rules:
        - Explicit ``provider/model`` prefix: pinned, no cascade.
        - Known model prefix (gpt-*, claude-*, bare name): preferred provider
          first, cascade on 5xx/429 only, stop on 4xx.
        - Unknown prefix: full cascade with WARNING log.

        Raises:
            ProviderCascadeExhausted: if every provider in the cascade returns 5xx / times out.
        """
        model = request_body.get("model", "")
        ordered, is_pinned = self._build_ordered_providers(model)
        last_exc: Exception | None = None

        for provider_name in ordered:
            provider = self._builder(provider_name)
            try:
                url, provider_headers, provider_body = provider.format_request(request_body)
                merged_headers = {**extra_headers, **provider_headers}
                # Remove host header -- it will be wrong for the new upstream
                merged_headers.pop("host", None)
                merged_headers.pop("Host", None)

                resp = await self._http_client.post(
                    url,
                    headers=merged_headers,
                    json=provider_body,
                    timeout=_PROVIDER_TIMEOUT,
                )
            except httpx.TimeoutException as exc:
                logger.warning("Provider %s timed out: %s", provider_name, exc)
                self._health.record_error(provider_name)
                last_exc = exc
                continue
            except httpx.RequestError as exc:
                logger.warning("Provider %s request error: %s", provider_name, exc)
                self._health.record_error(provider_name)
                last_exc = exc
                continue

            if provider.is_error(resp.status_code):
                logger.warning(
                    "Provider %s returned %s, trying next", provider_name, resp.status_code
                )
                self._health.record_error(provider_name)
                last_exc = RuntimeError(
                    f"Provider {provider_name} returned HTTP {resp.status_code}"
                )
                continue

            if provider.is_client_error(resp.status_code):
                # Client errors (4xx except 429) should not cascade -- the
                # request itself is invalid (e.g. deprecated model, bad params).
                # Surface the upstream error instead of silently returning empty.
                try:
                    error_body = resp.json()
                except Exception:
                    error_body = {"error": resp.text}
                error_detail = error_body.get("error", {})
                if isinstance(error_detail, dict):
                    msg = error_detail.get("message", str(error_detail))
                else:
                    msg = str(error_detail)
                logger.warning(
                    "Provider %s returned client error %s for model=%r: %s",
                    provider_name, resp.status_code, model, msg,
                )
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Provider {provider_name}: {msg}",
                )

            # Success
            self._health.record_success(provider_name)
            try:
                response_json = resp.json()
            except Exception:
                response_json = {}
            normalized = provider.parse_response(response_json)
            return normalized, provider_name

        raise ProviderCascadeExhausted(
            f"All providers exhausted. Last error: {last_exc}"
        )
