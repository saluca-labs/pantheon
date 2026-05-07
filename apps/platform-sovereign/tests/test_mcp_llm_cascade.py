# tests/test_mcp_llm_cascade.py
"""Tests for the mcp-llm cascade router.

The tests monkey‑patch the provider callables to simulate success and failure
scenarios, ensuring the router falls back correctly.
"""

import pytest
from src.tiresias_sovereign.mcp_llm.router import MCPPipelineRouter, ProviderError


def make_provider(response=None, error=None):
    """Factory to create a simple provider callable.

    If *error* is provided, the callable raises ``ProviderError`` with that message.
    Otherwise it returns *response*.
    """
    def provider(_payload):
        if error:
            raise ProviderError(error)
        return response
    return provider


def test_router_success_first_provider():
    payload = {"prompt": "Hello"}
    router = MCPPipelineRouter(providers=[
        make_provider(response={"model": "anthropic", "content": "a"}),
        make_provider(response={"model": "openai", "content": "b"}),
        make_provider(response={"model": "ollama", "content": "c"}),
    ])
    result = router.route(payload)
    assert result["model"] == "anthropic"
    assert result["content"] == "a"


def test_router_fallback_to_second():
    payload = {"prompt": "Hello"}
    router = MCPPipelineRouter(providers=[
        make_provider(error="anthropic down"),
        make_provider(response={"model": "openai", "content": "b"}),
        make_provider(response={"model": "ollama", "content": "c"}),
    ])
    result = router.route(payload)
    assert result["model"] == "openai"
    assert result["content"] == "b"


def test_router_fallback_to_third():
    payload = {"prompt": "Hello"}
    router = MCPPipelineRouter(providers=[
        make_provider(error="anthropic down"),
        make_provider(error="openai down"),
        make_provider(response={"model": "ollama", "content": "c"}),
    ])
    result = router.route(payload)
    assert result["model"] == "ollama"
    assert result["content"] == "c"


def test_router_all_fail():
    payload = {"prompt": "Hello"}
    router = MCPPipelineRouter(providers=[
        make_provider(error="anthropic down"),
        make_provider(error="openai down"),
        make_provider(error="ollama down"),
    ])
    with pytest.raises(ProviderError) as exc:
        router.route(payload)
    assert "All providers failed" in str(exc.value)
