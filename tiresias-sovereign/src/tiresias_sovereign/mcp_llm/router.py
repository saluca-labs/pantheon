# src/tiresias_sovereign/mcp_llm/router.py
"""MCP LLM cascade router.

The router attempts to fulfill a request by trying a series of LLM providers in order:
1. Anthropic
2. OpenAI
3. Ollama (local)

If a provider raises an exception (e.g., network error, rate limit), the router falls back to the next provider.

The implementation is deliberately lightweight: each provider call is abstracted behind a callable that returns a response dict.
"""

from typing import Callable, Dict, List, Any

class ProviderError(Exception):
    """Raised when a provider fails to fulfill the request."""

class MCPPipelineRouter:
    """Router that attempts LLM calls in a cascade.

    Parameters
    ----------
    providers: List[Callable[[Dict[str, Any]], Dict[str, Any]]]
        A list of callables representing LLM providers. Each callable receives the
        request payload and returns a response dict. The callables should raise
        ``ProviderError`` on failure so the router can try the next backend.
    """

    def __init__(self, providers: List[Callable[[Dict[str, Any]], Dict[str, Any]]]):
        if not providers:
            raise ValueError("At least one provider must be supplied")
        self.providers = providers

    def route(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Attempt to get a response from the cascade of providers.

        The first provider that returns without raising ``ProviderError`` wins.
        """
        last_error = None
        for provider in self.providers:
            try:
                return provider(payload)
            except ProviderError as exc:
                last_error = exc
        # If we get here, all providers failed.
        raise ProviderError(f"All providers failed: {last_error}")

# Helper stubs for the three providers. In production these would be real HTTP
# calls; in tests they are monkey‑patched.

def anthropic_provider(payload: Dict[str, Any]) -> Dict[str, Any]:
    raise ProviderError("Anthropic service unavailable")

def openai_provider(payload: Dict[str, Any]) -> Dict[str, Any]:
    raise ProviderError("OpenAI service unavailable")

def ollama_provider(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Simulate a successful local Ollama call.
    return {"model": "ollama", "content": "local response"}

# Export a ready‑to‑use router instance following the required order.
router = MCPPipelineRouter(providers=[anthropic_provider, openai_provider, ollama_provider])
