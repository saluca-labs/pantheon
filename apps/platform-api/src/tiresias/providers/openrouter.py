from __future__ import annotations

from .openai import OpenAIProvider


class OpenRouterProvider(OpenAIProvider):
    """OpenRouter provider — OpenAI-compatible API with provider-prefix normalization.

    OpenRouter exposes a unified ``/v1/chat/completions`` that accepts any
    upstream model addressed as ``<vendor>/<model>`` (e.g. ``anthropic/claude-3.5-sonnet``,
    ``meta-llama/llama-3.1-8b-instruct``). Pantheon's router uses the first path
    segment of the model name to pick a Pantheon-side provider, so callers must
    address OpenRouter models as ``openrouter/<vendor>/<model>``. This adapter
    strips the leading ``openrouter/`` so the wire request carries OpenRouter's
    native ``<vendor>/<model>`` identifier.
    """

    def __init__(
        self,
        api_key: str,
        api_base: str = "https://openrouter.ai/api",
        http_referer: str | None = None,
        x_title: str | None = None,
    ) -> None:
        super().__init__(api_key=api_key, api_base=api_base)
        self._http_referer = http_referer
        self._x_title = x_title

    @property
    def name(self) -> str:
        return "openrouter"

    def format_request(self, body: dict) -> tuple[str, dict, dict]:
        url, headers, payload = super().format_request(body)
        model = payload.get("model", "")
        if model.startswith("openrouter/"):
            payload["model"] = model[len("openrouter/"):]
        if self._http_referer:
            headers["HTTP-Referer"] = self._http_referer
        if self._x_title:
            headers["X-Title"] = self._x_title
        return url, headers, payload
