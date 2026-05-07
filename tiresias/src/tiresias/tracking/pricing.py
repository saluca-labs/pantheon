from __future__ import annotations

# Pricing in USD per 1M tokens (input/output separate)
# Updated: 2026-03-13
PRICING_TABLE: dict[str, dict[str, float]] = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4-turbo-preview": {"input": 10.00, "output": 30.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gpt-3.5-turbo-0125": {"input": 0.50, "output": 1.50},
    "o1": {"input": 15.00, "output": 60.00},
    "o1-mini": {"input": 3.00, "output": 12.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
    # Anthropic
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus-4-5": {"input": 15.00, "output": 75.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "claude-opus-4-6": {"input": 15.00, "output": 75.00},
    # Gemini
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-1.0-pro": {"input": 0.50, "output": 1.50},
    # Groq (LPU inference)
    "llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
    "llama-3.1-70b-versatile": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b-instant": {"input": 0.05, "output": 0.08},
    "mixtral-8x7b-32768": {"input": 0.24, "output": 0.24},
    "gemma2-9b-it": {"input": 0.20, "output": 0.20},
    # ---------------------------------------------------------------------------
    # Ollama Cloud models — placeholder pricing, refine when Ollama exposes metered billing
    # Tier guide (per 1M tokens): Small<30B=$0.05/$0.15, Mid 30-120B=$0.15/$0.45,
    # Large 120-400B=$0.40/$1.20, XLarge 400B-1T=$1.00/$3.00. Thinking: +50% output.
    # ---------------------------------------------------------------------------
    # DeepSeek — published API prices used as proxy
    "deepseek-v3.2:cloud": {"input": 0.27, "output": 1.10},   # 671B; DeepSeek-V3 public API price
    # Qwen3-Coder family
    "qwen3-coder:480b-cloud": {"input": 1.00, "output": 3.00},  # 480B XLarge  # placeholder pricing, refine when Ollama exposes metered billing
    "qwen3-coder-next:cloud": {"input": 1.00, "output": 3.00},  # XLarge experimental  # placeholder pricing, refine when Ollama exposes metered billing
    "qwen3-coder:30b-a3b-q4_K_M": {"input": 0.05, "output": 0.15},  # local 30B small  # placeholder pricing, refine when Ollama exposes metered billing
    # Qwen3 general
    "qwen3.5:397b-cloud": {"input": 1.00, "output": 3.00},      # 397B XLarge  # placeholder pricing, refine when Ollama exposes metered billing
    "qwen3-next:80b-cloud": {"input": 0.15, "output": 0.45},    # 80B mid  # placeholder pricing, refine when Ollama exposes metered billing
    "qwen3-vl:235b-cloud": {"input": 0.40, "output": 1.20},     # 235B large  # placeholder pricing, refine when Ollama exposes metered billing
    # Kimi (Moonshot)
    "kimi-k2.5:cloud": {"input": 0.40, "output": 1.20},         # large multimodal  # placeholder pricing, refine when Ollama exposes metered billing
    "kimi-k2:1t-cloud": {"input": 1.00, "output": 3.00},        # 1T XLarge  # placeholder pricing, refine when Ollama exposes metered billing
    "kimi-k2-thinking:cloud": {"input": 1.00, "output": 4.50},  # 1T thinking +50% output  # placeholder pricing, refine when Ollama exposes metered billing
    # Mistral / Devstral
    "mistral-large-3:675b-cloud": {"input": 1.00, "output": 3.00},   # 675B XLarge  # placeholder pricing, refine when Ollama exposes metered billing
    "devstral-2:123b-cloud": {"input": 0.40, "output": 1.20},         # 123B large  # placeholder pricing, refine when Ollama exposes metered billing
    "devstral-small-2:24b-cloud": {"input": 0.05, "output": 0.15},    # 24B small  # placeholder pricing, refine when Ollama exposes metered billing
    "ministral-3:3b-cloud": {"input": 0.05, "output": 0.15},          # 3B small  # placeholder pricing, refine when Ollama exposes metered billing
    "ministral-3:8b-cloud": {"input": 0.05, "output": 0.15},          # 8B small  # placeholder pricing, refine when Ollama exposes metered billing
    "ministral-3:14b-cloud": {"input": 0.15, "output": 0.45},         # 14B mid  # placeholder pricing, refine when Ollama exposes metered billing
    # Cogito / Nemotron
    "cogito-2.1:671b-cloud": {"input": 1.00, "output": 3.00},         # 671B XLarge  # placeholder pricing, refine when Ollama exposes metered billing
    "nemotron-3-super:cloud": {"input": 0.40, "output": 1.20},        # 120B large  # placeholder pricing, refine when Ollama exposes metered billing
    "nemotron-3-nano:30b-cloud": {"input": 0.05, "output": 0.15},     # 30B small  # placeholder pricing, refine when Ollama exposes metered billing
    # GPT-OSS (open-source OpenAI models)
    "gpt-oss:120b-cloud": {"input": 0.10, "output": 0.30},            # 120B; OSS placeholder  # placeholder pricing, refine when Ollama exposes metered billing
    "gpt-oss:20b-cloud": {"input": 0.05, "output": 0.15},             # 20B small OSS  # placeholder pricing, refine when Ollama exposes metered billing
    # Gemini cloud (via Ollama)
    "gemini-3-flash-preview:cloud": {"input": 0.10, "output": 0.40},  # Flash tier  # placeholder pricing, refine when Ollama exposes metered billing
    # Gemma (Google open)
    "gemma3:4b-cloud": {"input": 0.05, "output": 0.15},               # 4B small  # placeholder pricing, refine when Ollama exposes metered billing
    "gemma3:12b-cloud": {"input": 0.05, "output": 0.15},              # 12B small  # placeholder pricing, refine when Ollama exposes metered billing
    "gemma3:27b-cloud": {"input": 0.15, "output": 0.45},              # 27B mid  # placeholder pricing, refine when Ollama exposes metered billing
    "gemma4:26b": {"input": 0.15, "output": 0.45},                    # 26B local vision  # placeholder pricing, refine when Ollama exposes metered billing
    "gemma4:31b-cloud": {"input": 0.15, "output": 0.45},              # 31B mid  # placeholder pricing, refine when Ollama exposes metered billing
    # GLM (Zhipu AI)
    "glm-4.6:cloud": {"input": 0.15, "output": 0.45},                 # mid  # placeholder pricing, refine when Ollama exposes metered billing
    "glm-4.7:cloud": {"input": 0.15, "output": 0.45},                 # mid  # placeholder pricing, refine when Ollama exposes metered billing
    "glm-5:cloud": {"input": 0.40, "output": 1.20},                   # large  # placeholder pricing, refine when Ollama exposes metered billing
    "glm-5.1:cloud": {"input": 0.40, "output": 1.20},                 # large  # placeholder pricing, refine when Ollama exposes metered billing
    # MiniMax
    "minimax-m2:cloud": {"input": 0.40, "output": 1.20},              # large  # placeholder pricing, refine when Ollama exposes metered billing
    "minimax-m2.1:cloud": {"input": 0.40, "output": 1.20},            # large  # placeholder pricing, refine when Ollama exposes metered billing
    "minimax-m2.5:cloud": {"input": 0.40, "output": 1.20},            # large  # placeholder pricing, refine when Ollama exposes metered billing
    "minimax-m2.7:cloud": {"input": 0.40, "output": 1.20},            # large  # placeholder pricing, refine when Ollama exposes metered billing
    # RNJ
    "rnj-1:8b-cloud": {"input": 0.05, "output": 0.15},               # 8B small  # placeholder pricing, refine when Ollama exposes metered billing
}

MODEL_PREFIX_FALLBACK: list[tuple[str, str]] = [
    ("gpt-4o-mini", "gpt-4o-mini"),
    ("gpt-4o", "gpt-4o"),
    ("gpt-4-turbo", "gpt-4-turbo"),
    ("gpt-4", "gpt-4"),
    ("gpt-3.5-turbo", "gpt-3.5-turbo"),
    ("o3-mini", "o3-mini"),
    ("o1-mini", "o1-mini"),
    ("o1", "o1"),
    ("claude-3-5-sonnet", "claude-3-5-sonnet-20241022"),
    ("claude-3-5-haiku", "claude-3-5-haiku-20241022"),
    ("claude-3-opus", "claude-3-opus-20240229"),
    ("claude-3-sonnet", "claude-3-sonnet-20240229"),
    ("claude-3-haiku", "claude-3-haiku-20240307"),
    ("claude-haiku-4-5", "claude-haiku-4-5-20251001"),
    ("claude-sonnet-4-6", "claude-sonnet-4-6"),
    ("claude-sonnet-4", "claude-sonnet-4-6"),
    ("claude-opus-4-6", "claude-opus-4-6"),
    ("claude-opus-4", "claude-opus-4-6"),
    ("gemini-2.0-flash-lite", "gemini-2.0-flash-lite"),
    ("gemini-2.0-flash", "gemini-2.0-flash"),
    ("gemini-1.5-pro", "gemini-1.5-pro"),
    ("gemini-1.5-flash", "gemini-1.5-flash"),
    ("gemini-1.0-pro", "gemini-1.0-pro"),
    ("llama-3.3-70b", "llama-3.3-70b-versatile"),
    ("llama-3.1-70b", "llama-3.1-70b-versatile"),
    ("llama-3.1-8b", "llama-3.1-8b-instant"),
    ("mixtral-8x7b", "mixtral-8x7b-32768"),
    # Ollama Cloud prefix fallbacks
    ("deepseek-v3.2", "deepseek-v3.2:cloud"),
    ("qwen3-coder:480b", "qwen3-coder:480b-cloud"),
    ("qwen3-coder-next", "qwen3-coder-next:cloud"),
    ("qwen3.5:397b", "qwen3.5:397b-cloud"),
    ("qwen3-next:80b", "qwen3-next:80b-cloud"),
    ("qwen3-vl:235b", "qwen3-vl:235b-cloud"),
    ("kimi-k2-thinking", "kimi-k2-thinking:cloud"),
    ("kimi-k2:1t", "kimi-k2:1t-cloud"),
    ("kimi-k2.5", "kimi-k2.5:cloud"),
    ("mistral-large-3", "mistral-large-3:675b-cloud"),
    ("devstral-2:123b", "devstral-2:123b-cloud"),
    ("devstral-small-2", "devstral-small-2:24b-cloud"),
    ("ministral-3:3b", "ministral-3:3b-cloud"),
    ("ministral-3:8b", "ministral-3:8b-cloud"),
    ("ministral-3:14b", "ministral-3:14b-cloud"),
    ("cogito-2.1", "cogito-2.1:671b-cloud"),
    ("nemotron-3-super", "nemotron-3-super:cloud"),
    ("nemotron-3-nano", "nemotron-3-nano:30b-cloud"),
    ("gpt-oss:120b", "gpt-oss:120b-cloud"),
    ("gpt-oss:20b", "gpt-oss:20b-cloud"),
    ("gpt-oss", "gpt-oss:120b-cloud"),
    ("gemini-3-flash-preview", "gemini-3-flash-preview:cloud"),
    ("gemma3:4b", "gemma3:4b-cloud"),
    ("gemma3:12b", "gemma3:12b-cloud"),
    ("gemma3:27b", "gemma3:27b-cloud"),
    ("gemma4:31b", "gemma4:31b-cloud"),
    ("glm-4.6", "glm-4.6:cloud"),
    ("glm-4.7", "glm-4.7:cloud"),
    ("glm-5.1", "glm-5.1:cloud"),
    ("glm-5", "glm-5:cloud"),
    ("minimax-m2.7", "minimax-m2.7:cloud"),
    ("minimax-m2.5", "minimax-m2.5:cloud"),
    ("minimax-m2.1", "minimax-m2.1:cloud"),
    ("minimax-m2", "minimax-m2:cloud"),
    ("rnj-1:8b", "rnj-1:8b-cloud"),
]


def _resolve_model(model: str):
    if model in PRICING_TABLE:
        return model
    for prefix, resolved in MODEL_PREFIX_FALLBACK:
        if model.startswith(prefix):
            return resolved
    return None


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    resolved = _resolve_model(model)
    if resolved is None:
        return 0.0
    pricing = PRICING_TABLE[resolved]
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 8)


def get_pricing(model: str):
    resolved = _resolve_model(model)
    if resolved is None:
        return None
    return PRICING_TABLE[resolved]
