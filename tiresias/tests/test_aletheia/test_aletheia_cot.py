"""
Tests for Aletheia CoT extraction engine and SHA-512 hash chain.
Covers ALETH-08 (provider extractors) and ALETH-09 (hash chain integrity).
"""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

from src.aletheia.extractors import (
    CotExtraction,
    extract_anthropic,
    extract_openai,
    extract_gemini,
    extract_local,
    extract_cot,
    detect_provider,
)
from src.aletheia.chain import (
    compute_cot_hash,
    compute_entry_hash,
    compute_genesis_hash,
)


# ---------------------------------------------------------------------------
# ALETH-08: Extractor tests
# ---------------------------------------------------------------------------


class TestExtractAnthropic:
    """Test Anthropic thinking block extraction."""

    def test_extract_anthropic_thinking_blocks(self):
        body = {
            "model": "claude-sonnet-4-20250514",
            "content": [
                {"type": "thinking", "thinking": "Let me reason about this..."},
                {"type": "text", "text": "Here is my answer."},
                {"type": "thinking", "thinking": "And another thought."},
            ],
            "usage": {
                "input_tokens": 100,
                "output_tokens": 50,
                "cache_creation_input_tokens": 42,
            },
        }
        result = extract_anthropic(body)
        assert result is not None
        assert result.provider == "anthropic"
        assert result.has_reasoning is True
        assert "Let me reason about this..." in result.reasoning_text
        assert "And another thought." in result.reasoning_text
        assert result.token_count == 42
        assert result.byte_count > 0
        assert result.model == "claude-sonnet-4-20250514"

    def test_extract_anthropic_no_thinking(self):
        body = {
            "model": "claude-sonnet-4-20250514",
            "content": [
                {"type": "text", "text": "Just a normal response."},
            ],
        }
        result = extract_anthropic(body)
        assert result is None

    def test_extract_anthropic_token_estimate_fallback(self):
        body = {
            "model": "claude-sonnet-4-20250514",
            "content": [
                {"type": "thinking", "thinking": "A" * 400},
            ],
            "usage": {"input_tokens": 100},
        }
        result = extract_anthropic(body)
        assert result is not None
        assert result.token_count == 100  # 400 // 4


class TestExtractOpenAI:
    """Test OpenAI reasoning token extraction."""

    def test_extract_openai_reasoning_tokens(self):
        body = {
            "model": "o3-mini",
            "choices": [{"message": {"content": "Answer"}}],
            "usage": {
                "completion_tokens": 150,
                "completion_tokens_details": {
                    "reasoning_tokens": 120,
                },
            },
        }
        result = extract_openai(body)
        assert result is not None
        assert result.provider == "openai"
        assert result.has_reasoning is True
        assert result.reasoning_text is None  # OpenAI does not expose content
        assert result.token_count == 120
        assert result.byte_count == 0
        assert result.model == "o3-mini"

    def test_extract_openai_no_reasoning(self):
        body = {
            "model": "gpt-4",
            "usage": {
                "completion_tokens": 50,
                "completion_tokens_details": {
                    "reasoning_tokens": 0,
                },
            },
        }
        result = extract_openai(body)
        assert result is None

    def test_extract_openai_missing_details(self):
        body = {
            "model": "gpt-4",
            "usage": {"completion_tokens": 50},
        }
        result = extract_openai(body)
        assert result is None


class TestExtractGemini:
    """Test Gemini thinking part extraction."""

    def test_extract_gemini_thought_parts(self):
        body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"thought": True, "text": "Thinking step 1..."},
                            {"text": "Regular output."},
                            {"thought": True, "text": "Thinking step 2..."},
                        ]
                    }
                }
            ],
            "modelVersion": "gemini-2.5-pro",
        }
        result = extract_gemini(body)
        assert result is not None
        assert result.provider == "gemini"
        assert result.has_reasoning is True
        assert "Thinking step 1..." in result.reasoning_text
        assert "Thinking step 2..." in result.reasoning_text
        assert result.model == "gemini-2.5-pro"

    def test_extract_gemini_no_thought(self):
        body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "Just a normal response."},
                        ]
                    }
                }
            ],
        }
        result = extract_gemini(body)
        assert result is None


class TestExtractLocal:
    """Test local model <thinking> tag extraction."""

    def test_extract_local_thinking_tags(self):
        body = {
            "model": "llama-3",
            "choices": [
                {
                    "message": {
                        "content": "Before <thinking>Internal reasoning here</thinking> After <thinking>More reasoning</thinking> End"
                    }
                }
            ],
        }
        result = extract_local(body)
        assert result is not None
        assert result.provider == "local"
        assert result.has_reasoning is True
        assert "Internal reasoning here" in result.reasoning_text
        assert "More reasoning" in result.reasoning_text
        assert result.model == "llama-3"

    def test_extract_local_no_thinking(self):
        body = {
            "model": "llama-3",
            "choices": [
                {"message": {"content": "Just a plain response."}}
            ],
        }
        result = extract_local(body)
        assert result is None


class TestExtractNoReasoning:
    """Test that all providers return None when no reasoning is present."""

    def test_anthropic_empty_content(self):
        assert extract_anthropic({"content": []}) is None

    def test_openai_zero_tokens(self):
        assert extract_openai({"usage": {"completion_tokens_details": {"reasoning_tokens": 0}}}) is None

    def test_gemini_no_candidates(self):
        assert extract_gemini({}) is None

    def test_local_no_tags(self):
        assert extract_local({"choices": [{"message": {"content": "no tags"}}]}) is None


class TestDetectProvider:
    """Test upstream name to provider normalization."""

    def test_anthropic_variants(self):
        assert detect_provider("anthropic-prod") == "anthropic"
        assert detect_provider("claude-3-sonnet") == "anthropic"
        assert detect_provider("ANTHROPIC") == "anthropic"

    def test_openai_variants(self):
        assert detect_provider("openai-gpt4") == "openai"
        assert detect_provider("gpt-4-turbo") == "openai"
        assert detect_provider("o1-preview") == "openai"
        assert detect_provider("o3-mini") == "openai"

    def test_gemini_variants(self):
        assert detect_provider("gemini-pro") == "gemini"
        assert detect_provider("google-ai") == "gemini"

    def test_unknown_defaults_local(self):
        assert detect_provider("my-custom-model") == "local"
        assert detect_provider("llama-server") == "local"


class TestExtractCotDispatch:
    """Test the main dispatch function."""

    def test_dispatches_to_anthropic(self):
        body = {
            "model": "claude-sonnet-4-20250514",
            "content": [{"type": "thinking", "thinking": "test"}],
            "usage": {},
        }
        result = extract_cot("anthropic", body)
        assert result is not None
        assert result.provider == "anthropic"

    def test_returns_none_on_error(self):
        # Pass something that will cause an error inside extractors
        result = extract_cot("anthropic", None)
        assert result is None

    def test_unknown_provider_uses_local(self):
        body = {
            "choices": [{"message": {"content": "<thinking>test</thinking>"}}],
        }
        result = extract_cot("unknown", body)
        assert result is not None
        assert result.provider == "local"


# ---------------------------------------------------------------------------
# ALETH-09: Hash chain tests
# ---------------------------------------------------------------------------


class TestGenesisHash:
    """Test genesis hash computation."""

    def test_genesis_hash_deterministic(self):
        tenant_id = "ac6b4247-03ee-4c45-b9ea-06a4aaceeb75"
        h1 = compute_genesis_hash(tenant_id)
        h2 = compute_genesis_hash(tenant_id)
        assert h1 == h2
        assert len(h1) == 128  # SHA-512 hex digest

    def test_genesis_hash_different_tenants(self):
        h1 = compute_genesis_hash("tenant-a")
        h2 = compute_genesis_hash("tenant-b")
        assert h1 != h2


class TestComputeEntryHash:
    """Test entry hash computation."""

    def test_compute_entry_hash_deterministic(self):
        args = (1, "req-123", "2026-03-21T00:00:00+00:00", "abc" * 42, "def" * 42)
        h1 = compute_entry_hash(*args)
        h2 = compute_entry_hash(*args)
        assert h1 == h2
        assert len(h1) == 128

    def test_compute_entry_hash_different_inputs(self):
        h1 = compute_entry_hash(1, "req-1", "ts1", "cot1", "prev1")
        h2 = compute_entry_hash(2, "req-1", "ts1", "cot1", "prev1")
        assert h1 != h2


class TestComputeCotHash:
    """Test CoT content hash computation."""

    def test_with_reasoning_text(self):
        h = compute_cot_hash("reasoning content", 100)
        expected = hashlib.sha512(b"reasoning content").hexdigest()
        assert h == expected

    def test_without_reasoning_text_openai(self):
        h = compute_cot_hash(None, 120)
        expected = hashlib.sha512(b"reasoning_tokens::120").hexdigest()
        assert h == expected

    def test_deterministic(self):
        h1 = compute_cot_hash("same text", 50)
        h2 = compute_cot_hash("same text", 50)
        assert h1 == h2


class TestVerifyChainInMemory:
    """Test chain verification logic using in-memory chain construction."""

    def _build_chain(self, count: int, tamper_index: int | None = None):
        """Build a list of mock chain entries for verification testing."""
        tenant_id = str(uuid.uuid4())
        chain_id = uuid.uuid4()

        # Genesis
        genesis_cot_hash = hashlib.sha512(b"genesis").hexdigest()
        genesis_prev_hash = compute_genesis_hash(tenant_id)
        now = datetime(2026, 3, 21, 0, 0, 0, tzinfo=timezone.utc)
        genesis_ts = now.isoformat()
        genesis_entry_hash = compute_entry_hash(
            0, str(uuid.UUID(int=0)), genesis_ts, genesis_cot_hash, genesis_prev_hash
        )

        entries = [_MockEntry(
            entry_index=0,
            request_id=uuid.UUID(int=0),
            timestamp=now,
            cot_hash=genesis_cot_hash,
            prev_hash=genesis_prev_hash,
            entry_hash=genesis_entry_hash,
        )]

        for i in range(1, count):
            req_id = uuid.uuid4()
            ts = datetime(2026, 3, 21, 0, i, 0, tzinfo=timezone.utc)
            cot_hash = compute_cot_hash(f"reasoning {i}", i * 10)
            prev_hash = entries[-1].entry_hash
            entry_hash = compute_entry_hash(
                i, str(req_id), ts.isoformat(), cot_hash, prev_hash
            )
            entries.append(_MockEntry(
                entry_index=i,
                request_id=req_id,
                timestamp=ts,
                cot_hash=cot_hash,
                prev_hash=prev_hash,
                entry_hash=entry_hash,
            ))

        # Tamper if requested
        if tamper_index is not None and 0 <= tamper_index < len(entries):
            entries[tamper_index].entry_hash = "tampered_" + "0" * 119

        return entries

    def test_verify_chain_valid(self):
        """Construct 5-entry chain, verify all links are correct."""
        entries = self._build_chain(5)
        result = _verify_entries(entries)
        assert result["valid"] is True
        assert result["entries_checked"] == 5

    def test_verify_chain_tampered(self):
        """Modify one entry_hash, verify detects the break."""
        entries = self._build_chain(5, tamper_index=2)
        result = _verify_entries(entries)
        assert result["valid"] is False
        assert result["first_broken_index"] == 2
        assert "entry_hash mismatch" in result["error"]

    def test_verify_chain_single_entry(self):
        entries = self._build_chain(1)
        result = _verify_entries(entries)
        assert result["valid"] is True
        assert result["entries_checked"] == 1

    def test_verify_chain_empty(self):
        result = _verify_entries([])
        assert result["valid"] is True
        assert result["entries_checked"] == 0

    def test_verify_chain_broken_linkage(self):
        """Break prev_hash linkage between entries."""
        entries = self._build_chain(5)
        # Corrupt prev_hash of entry 3 (but keep entry_hash consistent with the bad prev_hash)
        entries[3].prev_hash = "broken_" + "0" * 121
        # Recompute entry_hash with the broken prev_hash so entry_hash itself is valid
        entries[3].entry_hash = compute_entry_hash(
            entries[3].entry_index,
            str(entries[3].request_id),
            entries[3].timestamp.isoformat(),
            entries[3].cot_hash,
            entries[3].prev_hash,
        )
        result = _verify_entries(entries)
        assert result["valid"] is False
        assert result["first_broken_index"] == 3
        assert "prev_hash linkage broken" in result["error"]


# ---------------------------------------------------------------------------
# Helpers for in-memory verification (mirrors chain.verify_chain_range logic)
# ---------------------------------------------------------------------------

@dataclass
class _MockEntry:
    entry_index: int
    request_id: uuid.UUID
    timestamp: datetime
    cot_hash: str
    prev_hash: str
    entry_hash: str


def _verify_entries(entries: list[_MockEntry]) -> dict:
    """In-memory chain verification (same logic as chain.verify_chain_range)."""
    if not entries:
        return {"valid": True, "entries_checked": 0, "first_broken_index": None, "error": None}

    for i, entry in enumerate(entries):
        recomputed = compute_entry_hash(
            entry_index=entry.entry_index,
            request_id=str(entry.request_id),
            timestamp=entry.timestamp.isoformat(),
            cot_hash=entry.cot_hash,
            prev_hash=entry.prev_hash,
        )
        if recomputed != entry.entry_hash:
            return {
                "valid": False,
                "entries_checked": i + 1,
                "first_broken_index": entry.entry_index,
                "error": f"entry_hash mismatch at index {entry.entry_index}",
            }

        if i > 0:
            prev_entry = entries[i - 1]
            if entry.prev_hash != prev_entry.entry_hash:
                return {
                    "valid": False,
                    "entries_checked": i + 1,
                    "first_broken_index": entry.entry_index,
                    "error": f"prev_hash linkage broken at index {entry.entry_index}",
                }

    return {
        "valid": True,
        "entries_checked": len(entries),
        "first_broken_index": None,
        "error": None,
    }
