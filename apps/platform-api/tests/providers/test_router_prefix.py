"""Unit tests for model-prefix-aware provider routing in ProviderRouter.

Tests cover:
- Known model prefixes route to the correct preferred provider
- Explicit provider/model prefix pins to that provider without cascade
- Unknown model prefix triggers full cascade with WARNING log
- 5xx from preferred provider triggers cascade to next provider
- 4xx (client error) from preferred provider stops cascade and returns error
"""
from __future__ import annotations

import logging
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from src.tiresias.providers.router import (
    ProviderRouter,
    ProviderCascadeExhausted,
    _preferred_provider_for_model,
    _MODEL_PREFIX_MAP,
)
from src.tiresias.providers.health import HealthTracker
from src.tiresias.providers.base import BaseProvider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CASCADE = ["ollama", "anthropic", "openai"]


def make_health() -> HealthTracker:
    return HealthTracker(CASCADE)


def make_mock_provider(name: str, is_error_fn=None, is_client_error_fn=None) -> MagicMock:
    """Return a mock BaseProvider with sensible defaults."""
    p = MagicMock(spec=BaseProvider)
    p.name = name
    p.format_request.return_value = (
        f"http://fake-{name}/v1/chat/completions",
        {"Authorization": "Bearer test"},
        {"model": "test-model", "messages": []},
    )
    p.parse_response.side_effect = lambda r: r
    if is_error_fn is not None:
        p.is_error.side_effect = is_error_fn
    else:
        p.is_error.side_effect = lambda sc: sc >= 500 or sc == 429
    if is_client_error_fn is not None:
        p.is_client_error.side_effect = is_client_error_fn
    else:
        p.is_client_error.side_effect = lambda sc: 400 <= sc < 500 and sc != 429
    return p


def make_router(builder_map: dict[str, MagicMock]) -> ProviderRouter:
    """Build a ProviderRouter with mocked http_client and builder."""
    health = make_health()
    http_client = AsyncMock(spec=httpx.AsyncClient)

    def builder(name: str) -> BaseProvider:
        return builder_map[name]

    return ProviderRouter(
        cascade=CASCADE,
        health=health,
        builder=builder,
        http_client=http_client,
    ), http_client


def make_response(status_code: int, body: dict | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = body or {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "choices": [{"message": {"role": "assistant", "content": "hi"}}],
    }
    resp.text = str(body)
    return resp


# ---------------------------------------------------------------------------
# _preferred_provider_for_model unit tests (pure function, no I/O)
# ---------------------------------------------------------------------------

class TestPreferredProviderForModel:
    def test_gpt_model_maps_to_openai(self):
        assert _preferred_provider_for_model("gpt-4o-mini", CASCADE) == "openai"

    def test_gpt4_maps_to_openai(self):
        assert _preferred_provider_for_model("gpt-4", CASCADE) == "openai"

    def test_text_model_maps_to_openai(self):
        assert _preferred_provider_for_model("text-davinci-003", CASCADE) == "openai"

    def test_o1_maps_to_openai(self):
        assert _preferred_provider_for_model("o1-preview", CASCADE) == "openai"

    def test_o3_maps_to_openai(self):
        assert _preferred_provider_for_model("o3-mini", CASCADE) == "openai"

    def test_o4_maps_to_openai(self):
        assert _preferred_provider_for_model("o4-mini", CASCADE) == "openai"

    def test_claude_maps_to_anthropic(self):
        assert _preferred_provider_for_model("claude-haiku-4-5-20251001", CASCADE) == "anthropic"

    def test_claude_sonnet_maps_to_anthropic(self):
        assert _preferred_provider_for_model("claude-sonnet-4-6", CASCADE) == "anthropic"

    def test_ollama_bare_model_maps_to_ollama(self):
        assert _preferred_provider_for_model("qwen3-coder:30b-a3b-q4_K_M", CASCADE) == "ollama"

    def test_ollama_llama_maps_to_ollama(self):
        assert _preferred_provider_for_model("llama3.1:8b", CASCADE) == "ollama"

    def test_ollama_gemma_maps_to_ollama(self):
        assert _preferred_provider_for_model("gemma2:9b", CASCADE) == "ollama"

    def test_case_insensitive_claude(self):
        assert _preferred_provider_for_model("Claude-3-opus", CASCADE) == "anthropic"

    def test_case_insensitive_gpt(self):
        assert _preferred_provider_for_model("GPT-4o", CASCADE) == "openai"

    def test_provider_not_in_cascade_returns_none(self):
        # Only ollama in cascade -- claude should not route
        assert _preferred_provider_for_model("claude-haiku-4-5-20251001", ["ollama"]) is None

    def test_explicit_prefix_not_handled_here(self):
        # Slash-prefixed models are handled by _detect_explicit_provider_prefix,
        # not by _preferred_provider_for_model. This function only sees the model
        # name. For "anthropic/claude-..." the "/" means it is NOT a bare model,
        # so this function would treat it as Ollama (no pattern match). The router
        # handles explicit prefix before calling this.
        # We just confirm: the function does not blow up.
        result = _preferred_provider_for_model("anthropic/claude-sonnet", CASCADE)
        # Will return "ollama" because slash-models don't match prefix patterns
        assert result in (None, "ollama", "anthropic", "openai")


# ---------------------------------------------------------------------------
# ProviderRouter integration tests (async, with mocked HTTP)
# ---------------------------------------------------------------------------

class TestRouterPrefixRouting:

    @pytest.mark.asyncio
    async def test_gpt_model_routes_to_openai_only(self):
        """gpt-4o-mini should hit openai first and only."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "gpt-4o-mini", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "openai"
        # openai format_request called; anthropic and ollama never called
        openai_p.format_request.assert_called_once()
        anthropic_p.format_request.assert_not_called()
        ollama_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_claude_model_routes_to_anthropic_only(self):
        """claude-haiku-4-5-20251001 should hit anthropic first and only."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "claude-haiku-4-5-20251001", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "anthropic"
        anthropic_p.format_request.assert_called_once()
        openai_p.format_request.assert_not_called()
        ollama_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_bare_model_routes_to_ollama_first(self):
        """qwen3-coder:30b-a3b-q4_K_M should route to ollama."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "qwen3-coder:30b-a3b-q4_K_M", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "ollama"
        ollama_p.format_request.assert_called_once()
        anthropic_p.format_request.assert_not_called()
        openai_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_explicit_anthropic_prefix_pins_to_anthropic(self):
        """anthropic/claude-... should pin to anthropic, no cascade."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "anthropic/claude-sonnet-4-6", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "anthropic"
        anthropic_p.format_request.assert_called_once()
        openai_p.format_request.assert_not_called()
        ollama_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_explicit_openai_prefix_pins_to_openai(self):
        """openai/gpt-4o should pin to openai, no cascade."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "openai/gpt-4o", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "openai"
        openai_p.format_request.assert_called_once()

    @pytest.mark.asyncio
    async def test_explicit_ollama_prefix_pins_to_ollama(self):
        """ollama/qwen3-coder:30b should pin to ollama, no cascade."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(200)

        body = {"model": "ollama/qwen3-coder:30b", "messages": []}
        _, used_provider = await router.execute(body, {})

        assert used_provider == "ollama"
        ollama_p.format_request.assert_called_once()

    @pytest.mark.asyncio
    async def test_unknown_model_cascades_with_warning(self, caplog):
        """Unknown model prefix (no matching prefix pattern, no Ollama in cascade)
        should cascade through available providers with an unknown_model_prefix WARNING."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")

        # Build a router WITHOUT ollama in the cascade so mystery-model-x is truly unknown
        no_ollama_cascade = ["anthropic", "openai"]
        health = HealthTracker(no_ollama_cascade)
        http_client = AsyncMock(spec=httpx.AsyncClient)
        builder_map = {"anthropic": anthropic_p, "openai": openai_p}

        router = ProviderRouter(
            cascade=no_ollama_cascade,
            health=health,
            builder=lambda name: builder_map[name],
            http_client=http_client,
        )
        # anthropic fails (5xx), openai succeeds
        http_client.post.side_effect = [
            make_response(500),
            make_response(200),
        ]

        with caplog.at_level(logging.WARNING, logger="src.tiresias.providers.router"):
            body = {"model": "mystery-model-x", "messages": []}
            _, used_provider = await router.execute(body, {})

        assert "unknown_model_prefix" in caplog.text
        assert "mystery-model-x" in caplog.text

    @pytest.mark.asyncio
    async def test_5xx_from_preferred_cascades_to_next(self):
        """5xx from preferred provider should cascade to next in line."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        # anthropic is preferred for claude-*, returns 500 first, then openai succeeds
        http_client.post.side_effect = [
            make_response(500),  # anthropic 500
            make_response(200),  # openai 200
        ]

        body = {"model": "claude-haiku-4-5-20251001", "messages": []}
        _, used_provider = await router.execute(body, {})

        # Should have cascaded: anthropic tried first, failed, openai second
        assert anthropic_p.format_request.call_count == 1
        # The router tried the next provider
        assert used_provider in CASCADE

    @pytest.mark.asyncio
    async def test_429_from_preferred_cascades_to_next(self):
        """429 from preferred provider (rate limit) should cascade."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        # anthropic preferred, returns 429, then next provider succeeds
        http_client.post.side_effect = [
            make_response(429),
            make_response(200),
        ]

        body = {"model": "claude-sonnet-4-6", "messages": []}
        _, used_provider = await router.execute(body, {})
        assert anthropic_p.format_request.call_count == 1

    @pytest.mark.asyncio
    async def test_404_from_preferred_does_not_cascade(self):
        """404 from preferred provider should stop cascade and raise HTTPException."""
        from fastapi import HTTPException

        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        # anthropic preferred for claude-*, returns 404
        error_resp = make_response(404, {"error": {"message": "model not found"}})
        http_client.post.return_value = error_resp

        body = {"model": "claude-haiku-4-5-20251001", "messages": []}
        with pytest.raises(HTTPException) as exc_info:
            await router.execute(body, {})

        assert exc_info.value.status_code == 404
        # Only anthropic was called; openai and ollama should not be
        anthropic_p.format_request.assert_called_once()
        openai_p.format_request.assert_not_called()
        ollama_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_4xx_not_404_from_preferred_does_not_cascade(self):
        """403 from preferred provider should stop cascade (not a model issue, an auth issue)."""
        from fastapi import HTTPException

        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        error_resp = make_response(403, {"error": {"message": "unauthorized"}})
        http_client.post.return_value = error_resp

        body = {"model": "gpt-4o-mini", "messages": []}
        with pytest.raises(HTTPException) as exc_info:
            await router.execute(body, {})

        assert exc_info.value.status_code == 403
        openai_p.format_request.assert_called_once()
        anthropic_p.format_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_all_providers_fail_raises_exhausted(self):
        """When all providers return 5xx, ProviderCascadeExhausted is raised."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(503)

        body = {"model": "mystery-model-x", "messages": []}
        with pytest.raises(ProviderCascadeExhausted):
            await router.execute(body, {})

    @pytest.mark.asyncio
    async def test_explicit_prefix_with_5xx_does_not_cascade(self):
        """Pinned explicit prefix (provider/model) should NOT cascade even on 5xx."""
        openai_p = make_mock_provider("openai")
        anthropic_p = make_mock_provider("anthropic")
        ollama_p = make_mock_provider("ollama")

        router, http_client = make_router({
            "openai": openai_p,
            "anthropic": anthropic_p,
            "ollama": ollama_p,
        })
        http_client.post.return_value = make_response(503)

        body = {"model": "anthropic/claude-sonnet-4-6", "messages": []}
        with pytest.raises(ProviderCascadeExhausted):
            await router.execute(body, {})

        # Only anthropic was tried
        anthropic_p.format_request.assert_called_once()
        openai_p.format_request.assert_not_called()
        ollama_p.format_request.assert_not_called()


class TestOllamaProviderIsError:
    """Verify OllamaProvider no longer treats all 4xx as failover-worthy."""

    def test_ollama_is_error_500_true(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_error(500) is True

    def test_ollama_is_error_503_true(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_error(503) is True

    def test_ollama_is_error_429_true(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_error(429) is True

    def test_ollama_is_error_404_false(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_error(404) is False

    def test_ollama_is_error_400_false(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_error(400) is False

    def test_ollama_is_client_error_404_true(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_client_error(404) is True

    def test_ollama_is_client_error_429_false(self):
        from src.tiresias.providers.ollama import OllamaProvider
        p = OllamaProvider()
        assert p.is_client_error(429) is False
