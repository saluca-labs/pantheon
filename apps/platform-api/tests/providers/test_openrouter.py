"""Tests for OpenRouter provider adapter."""
from src.tiresias.providers.openrouter import OpenRouterProvider


def _make_body(model: str = "openrouter/anthropic/claude-3.5-sonnet"):
    return {
        "model": model,
        "messages": [{"role": "user", "content": "Hello"}],
        "temperature": 0.7,
    }


def test_openrouter_name():
    p = OpenRouterProvider(api_key="or-test")
    assert p.name == "openrouter"


def test_openrouter_default_api_base():
    p = OpenRouterProvider(api_key="or-test")
    assert p.api_base == "https://openrouter.ai/api"


def test_openrouter_api_base_override():
    p = OpenRouterProvider(api_key="or-test", api_base="http://mock-router")
    assert p.api_base == "http://mock-router"


def test_openrouter_format_request_url():
    p = OpenRouterProvider(api_key="or-abc")
    url, _, _ = p.format_request(_make_body())
    assert url == "https://openrouter.ai/api/v1/chat/completions"


def test_openrouter_format_request_auth_header():
    p = OpenRouterProvider(api_key="or-abc")
    _, headers, _ = p.format_request(_make_body())
    assert headers["Authorization"] == "Bearer or-abc"


def test_openrouter_strips_pantheon_prefix():
    p = OpenRouterProvider(api_key="or-abc")
    _, _, body = p.format_request(_make_body("openrouter/anthropic/claude-3.5-sonnet"))
    assert body["model"] == "anthropic/claude-3.5-sonnet"


def test_openrouter_preserves_vendor_model_when_no_prefix():
    p = OpenRouterProvider(api_key="or-abc")
    _, _, body = p.format_request(_make_body("anthropic/claude-3.5-sonnet"))
    assert body["model"] == "anthropic/claude-3.5-sonnet"


def test_openrouter_does_not_mutate_original_body():
    p = OpenRouterProvider(api_key="or-abc")
    original = _make_body("openrouter/openai/gpt-4o-mini")
    p.format_request(original)
    assert original["model"] == "openrouter/openai/gpt-4o-mini"


def test_openrouter_optional_ranking_headers_absent_by_default():
    p = OpenRouterProvider(api_key="or-abc")
    _, headers, _ = p.format_request(_make_body())
    assert "HTTP-Referer" not in headers
    assert "X-Title" not in headers


def test_openrouter_optional_ranking_headers_set_when_configured():
    p = OpenRouterProvider(
        api_key="or-abc",
        http_referer="https://saluca.com",
        x_title="Saluca",
    )
    _, headers, _ = p.format_request(_make_body())
    assert headers["HTTP-Referer"] == "https://saluca.com"
    assert headers["X-Title"] == "Saluca"


def test_openrouter_parse_response_passthrough():
    p = OpenRouterProvider(api_key="or-abc")
    resp = {
        "id": "gen-abc",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hi"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 4, "completion_tokens": 1, "total_tokens": 5},
    }
    result = p.parse_response(resp)
    assert result["choices"][0]["message"]["content"] == "Hi"
