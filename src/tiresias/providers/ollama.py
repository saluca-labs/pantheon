from __future__ import annotations

from .openai import OpenAIProvider


class OllamaProvider(OpenAIProvider):
    """Ollama provider -- speaks OpenAI-compatible API with model-name normalization.

    Strips the ``ollama/`` prefix that litellm-style clients prepend, since
    Ollama's own ``/v1/chat/completions`` endpoint expects bare model names
    (e.g. ``llama3.1:8b`` not ``ollama/llama3.1:8b``).
    """

    def __init__(
        self, api_key: str = "", api_base: str = "http://localhost:11434"
    ) -> None:
        super().__init__(api_key=api_key or "ollama", api_base=api_base)

    @property
    def name(self) -> str:
        return "ollama"

    def format_request(self, body: dict) -> tuple[str, dict, dict]:
        url, headers, payload = super().format_request(body)
        # Strip ollama/ prefix so Ollama sees the bare model name
        model = payload.get("model", "")
        if model.startswith("ollama/"):
            payload["model"] = model[len("ollama/"):]
        return url, headers, payload

    def is_error(self, status_code: int) -> bool:
        """Ollama returns 5xx or 429 for transient errors -- those are failover-worthy.
        4xx errors (model not found, bad request) are surfaced to the caller via
        is_client_error() -- do NOT cascade on them, as the model-prefix router
        already selected Ollama as the correct provider for this model."""
        return status_code >= 500 or status_code == 429
