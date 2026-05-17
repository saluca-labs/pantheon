"""
soul/compression.py — Recursive compression engine (SAL-372)

Implements patent §7.3 Branch B (lossy compression path) and §7.4 (Soul synthesis).

Compression target: ≤ 15% of original byte-length (patent Claim 3).
Model: claude-haiku-4-5-20251001 — cost-efficient for high-volume summarization.

Two-level hierarchy:
  Level 1: compress_memory()  — single session context → compressed summary S_i
  Level 2: recursive_compress() — set of S_i → global state object S_global ("Soul")
"""

try:
    import anthropic
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    anthropic = None  # type: ignore[assignment]
    _ANTHROPIC_AVAILABLE = False

_MODEL = 'claude-haiku-4-5-20251001'
_COMPRESSION_THRESHOLD = 100   # memory_count above which compression is triggered
_TARGET_RATIO = 0.15           # 15% of original — patent Claim 3 upper bound


def _client():
    if not _ANTHROPIC_AVAILABLE:
        raise RuntimeError("anthropic package not installed — compression unavailable")
    return anthropic.Anthropic()   # reads ANTHROPIC_API_KEY from env


# ── Public API ────────────────────────────────────────────────────────────────

def compress_memory(content: str, session_id: str, level: int = 1) -> dict:
    """
    Compress a single memory context via structured AI summarization.

    Calls claude-haiku to produce a compressed summary S_i. The output
    byte-length target is ≤ 15% of the input (patent §7.3 Branch B, Claim 3).

    Args:
        content: Raw content string to compress (full session payload or prior summary).
        session_id: Owning session ID — included in prompt for provenance context.
        level: Compression level (1 = first-tier summary, 2 = Soul synthesis pass).

    Returns:
        Dict with keys:
            compressed (str): The compressed summary text.
            ratio (float): Achieved byte ratio compressed/original.
            original_len (int): Byte-length of input.
            compressed_len (int): Byte-length of output.
    """
    original_len = len(content.encode('utf-8'))
    max_budget = max(50, int(original_len * _TARGET_RATIO))  # 15% byte budget

    system_prompt = (
        "You are a precision memory compression engine for an AI session persistence system. "
        "Your task is to produce a highly compressed, lossless-semantics summary of the provided "
        "session context. Preserve: key facts, decisions, active tasks, named entities, and "
        "behavioral parameters. Discard: conversational filler, redundant phrasing, examples "
        "already captured in a conclusion. "
        f"Target output: no more than {_TARGET_RATIO * 100:.0f}% of the input byte-length "
        f"(hard cap: ~{max_budget} bytes). Be ruthlessly concise. Output only the summary — "
        "no preamble, no metadata, no explanation."
    )

    if level == 2:
        system_prompt = (
            "You are synthesizing a 'Soul' — a global state object for an AI agent. "
            "Aggregate the provided compressed session summaries into a single, structured "
            "document with clearly labeled sections: "
            "[PERSONA] persistent behavioral parameters and role definition; "
            "[FACTS] longitudinally accumulated knowledge and user-specific data; "
            "[TASKS] active objectives and in-progress work; "
            "[TEMPORAL] chronological scope (date range covered). "
            f"Target: 500–4000 tokens. No more than {_TARGET_RATIO * 100:.0f}% of aggregate "
            "input byte-length. Output only the Soul document."
        )

    client = _client()
    response = client.messages.create(
        model=_MODEL,
        max_tokens=min(4096, max(256, max_budget // 4)),  # rough token estimate
        system=system_prompt,
        messages=[
            {
                'role': 'user',
                'content': (
                    f"[session_id: {session_id}]\n\n"
                    f"{content}"
                ),
            }
        ],
    )

    compressed = response.content[0].text
    compressed_len = len(compressed.encode('utf-8'))
    ratio = compressed_len / original_len if original_len > 0 else 0.0

    return {
        'compressed': compressed,
        'ratio': round(ratio, 4),
        'original_len': original_len,
        'compressed_len': compressed_len,
    }


def should_compress(session_id: str, memory_count: int) -> bool:
    """
    Decide whether recursive compression should be triggered for a session.

    Implements the configurable threshold from patent §7.4. Returns True when
    accumulated memory count exceeds the compression trigger threshold.

    Args:
        session_id: Owning session ID (reserved for future per-session tuning).
        memory_count: Number of memory records currently stored for this session.

    Returns:
        True if compression should run; False otherwise.
    """
    return memory_count > _COMPRESSION_THRESHOLD


def recursive_compress(memories: list[dict]) -> str:
    """
    Recursively compress a list of compressed summaries into a global Soul object.

    Implements patent §7.4: aggregates S_1 … S_n through the AI Inference Engine
    to produce S_global. If the batch is too large for a single pass, applies
    hierarchical reduction (halving batches) until a single Soul is produced.

    Args:
        memories: List of memory dicts, each with at minimum a 'compressed_summary'
                  or 'summarized_context' key containing the summary text, plus
                  an optional 'session_id' key.

    Returns:
        The global state object string (Soul) — S_global.
    """
    if not memories:
        return ''

    # Extract summary texts
    texts: list[str] = []
    for m in memories:
        text = (
            m.get('compressed_summary')
            or m.get('summarized_context')
            or m.get('content', '')
        )
        if text:
            texts.append(text)

    if not texts:
        return ''

    # If only one summary, compress it to Soul directly
    if len(texts) == 1:
        result = compress_memory(texts[0], session_id='global', level=2)
        return result['compressed']

    # Hierarchical reduction: chunk into batches of 20, compress each batch,
    # then recurse on the resulting batch summaries until one remains.
    BATCH_SIZE = 20

    while len(texts) > 1:
        batch_summaries: list[str] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            combined = '\n\n---\n\n'.join(batch)
            session_label = f'batch-{i // BATCH_SIZE}'
            result = compress_memory(combined, session_id=session_label, level=2)
            batch_summaries.append(result['compressed'])
        texts = batch_summaries

    return texts[0]
