# Soul — Cryptographically Verified Persistent Memory for LLMs

> The only AI memory system that can prove its memories haven't been tampered with or silently degraded.

[![CI](https://github.com/cristianxruvalcaba-coder/soul/actions/workflows/ci.yml/badge.svg)](https://github.com/cristianxruvalcaba-coder/soul/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![PyPI](https://img.shields.io/pypi/v/soul-memory.svg)](https://pypi.org/project/soul-memory/)

---

## The Problem

LLMs forget everything between sessions. Existing memory solutions add retrieval — but none of them can answer the question that actually matters:

**How do you know the memory is intact?**

A memory system that silently drifts, gets tampered with, or loses facts between sessions is worse than no memory at all — it produces confident hallucinations backed by corrupted state. Soul solves both problems: persistent memory with cryptographic proof of integrity.

---

## What Makes Soul Different

| Feature | Soul | Mem0 | Letta | Zep |
|---|:---:|:---:|:---:|:---:|
| Content integrity verification (SHA-256) | Yes | No | No | No |
| Graph topology integrity (structure hash) | Yes | No | No | No |
| O(1) topic routing (TKHR-Index) | Yes | No | No | No |
| Recursive compression to fixed-size Soul object | Yes | No | Partial | No |
| Hash-graph with GDPR erasure path | Yes | No | No | No |
| Dual-path hot + cold storage | Yes | No | Partial | Partial |
| Bounded cold-start token footprint | Yes | No | No | No |
| Open source (Apache 2.0) | Yes | Yes | Yes | Partial |

**Soul's core guarantee:** every memory record carries two independent SHA-256 hashes — one over the content, one over the graph topology. At retrieval time (and on every cold-start), both are recomputed and compared against the stored values. Any tampering, silent corruption, or unauthorized modification surfaces as a `CONTENT_MISMATCH` or `STRUCTURE_MISMATCH` before the data is injected into context.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────┐
  │                     LLM / Agent Process                     │
  │                  (context window monitor)                   │
  └─────────────────────┬───────────────────────────────────────┘
                        │  write_memory(session_id, content, topics)
                        │
          ┌─────────────▼─────────────┐
          │     soul.storage layer    │
          │   dual-path write fan-out │
          └──────┬────────────┬───────┘
                 │            │
    ┌────────────▼──┐    ┌────▼──────────────────┐
    │   HOT TIER    │    │      COLD TIER         │
    │  in-process   │    │  Supabase / Cloud SQL  │
    │  dict cache   │    │   _memories table      │
    │  O(1) reads   │    │  content-addressable   │
    │  session-TTL  │    │  persistent, queried   │
    └───────────────┘    └────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     soul.hashing layer        │
                    │  H(content) — tamper-evidence │
                    │  H(topology) — provenance     │
                    │  Both SHA-256, stored at write│
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────▼────────────────────┐
              │           soul.tkhr layer                │
              │   TKHR-Index: SHA-256(topic) → [ids]     │
              │   O(1) topic lookup + weight scoring     │
              │   personalization weights [0.0 – 5.0]   │
              └─────────────────────┬────────────────────┘
                                    │
         ┌──────────────────────────▼─────────────────────────┐
         │              soul.compression layer                │
         │  Level 1: compress_memory() → S_i (15% budget)    │
         │  Level 2: recursive_compress() → S_global (Soul)  │
         │  Hierarchical batching if N summaries > 20        │
         └──────────────────────────┬─────────────────────────┘
                                    │
    ┌───────────────────────────────▼────────────────────────────┐
    │                  soul.prefetch layer                       │
    │  cold_start_init() → Prompt_init = [G] + [S_global] +     │
    │                        [S_latest]                         │
    │  Bounded token footprint: 5–15% of T_max                  │
    │  Integrity verified before injection                       │
    └────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────▼────────────────────┐
              │           soul.graph layer               │
              │  Hash-graph v2: FULL / CAN / PGN nodes   │
              │  One-way density downgrade (FULL→CAN→PGN)│
              │  GDPR erasure: PGN = hashes only         │
              └──────────────────────────────────────────┘
```

---

## Core Concepts

### Dual-Integrity Hash Mapping

Every memory record is protected by two independent SHA-256 hashes computed at write time and verified at read time:

- **`content_hash`** — `SHA-256(raw_content_bytes)`. Detects any modification to the stored content string.
- **`structure_hash`** — `SHA-256(session_id + sorted(neighbor_memory_ids))`. Detects any modification to the graph topology: adding edges, removing nodes, or reordering the provenance chain.

Both hashes are stored in the `_memories` table. On any retrieval, `verify_integrity()` recomputes both and returns `"VALID"`, `"CONTENT_MISMATCH"`, or `"STRUCTURE_MISMATCH"`. The cold-start `inject_soul()` call surfaces integrity warnings in the injected system message before they can contaminate context.

```python
from soul import compute_dual_hash, verify_integrity

hashes = compute_dual_hash(memory_id, content, neighbor_ids, session_id)
# -> {"content_hash": "a3f2...", "structure_hash": "7c91..."}

status = verify_integrity(memory_id, content,
                          hashes["content_hash"], hashes["structure_hash"],
                          neighbor_ids, session_id)
# -> "VALID" | "CONTENT_MISMATCH" | "STRUCTURE_MISMATCH"
```

### TKHR-Index (O(1) Topic Routing)

The Topic-Keyed Hash Routing Index maps `SHA-256(lowercase(topic_word))` to arrays of `memory_ids`. Every `write_memory()` call registers the memory under its topics. Lookups are primary-key fetches — no full-text scan, no embedding search required for exact-topic retrieval.

The index also maintains **personalization weights** per topic (range `[0.0, 5.0]`, default `1.0`). Weights drift upward on access (`+0.05` per lookup, capped at `3.0`) and decay toward neutral on session end. Multi-topic lookup scores memories by the sum of weights across matching topics, surfacing cross-topic relevant memories first.

```python
from soul import tkhr

# Single topic — O(1) hash table lookup
ids = tkhr.lookup("patent")

# Multi-topic weighted retrieval
ids = tkhr.lookup_multi(["patent", "filing", "tiresias"])

# Session-context boost
tkhr.boost_context(["patent", "claims"], boost=1.8)
```

### Recursive Compression Engine

When a session accumulates more than the compression threshold (default: 100 memories), Soul compresses them into a hierarchical summary:

- **Level 1 (`compress_memory`)**: A single session context is summarized to a target of `≤15%` of its original byte length via a structured AI prompt (claude-haiku). Key facts, decisions, named entities, and active tasks are preserved; conversational filler is discarded.
- **Level 2 (`recursive_compress`)**: N level-1 summaries are aggregated into a single **Soul object** (`S_global`) with labeled sections: `[PERSONA]`, `[FACTS]`, `[TASKS]`, `[TEMPORAL]`. If the batch exceeds 20 summaries, hierarchical reduction is applied (batches of 20 → compress → recurse) until a single Soul remains.

The compressed Soul and all intermediate summaries have their own `content_hash` computed and stored, so the compression output itself is tamper-evident.

### Hash-Graph v2 (FULL / CAN / PGN Nodes)

Memory nodes exist along a **density spectrum** of three types, and can only transition toward lower density (one-way, irreversible, audit-logged):

| Node Type | Fields Present | Use Case |
|---|---|---|
| `FULL` | content, summary, session_context, topic_hash, dual-hashes | Default — all data intact |
| `CONTEXT_ANCHORED` (CAN) | session_context, topic_hash, dual-hashes | Compressed/aged nodes that still participate in routing |
| `PURE_GRAPH` (PGN) | dual-hash arrays only | GDPR erasure terminal state — graph topology preserved |

GDPR erasure downgrades a node to `PGN`: all payload content is nullified while both hash reference arrays remain intact, preserving the graph's structural integrity for verification purposes. The downgrade is logged to `_node_downgrade_audit`.

---

## Quickstart

```bash
pip install soul-memory
```

```python
import os
from soul import write_memory, read_memory, cold_start_init

os.environ["SUPABASE_URL"] = "https://your-project.supabase.co"
os.environ["SUPABASE_SERVICE_KEY"] = "your-service-key"
os.environ["ANTHROPIC_API_KEY"] = "your-anthropic-key"

# Write a memory — dual-hashed, dual-pathed to hot + cold storage
memory_id = write_memory(
    session_id="session-001",
    content="User prefers concise responses. Active project: Soul open-source release.",
    topics=["preference", "project", "soul"],
)

# Cold-start a new session — loads Soul + latest summary, verifies integrity
init = cold_start_init("session-001")
print(init["integrity_status"])   # "VALID"
print(init["token_count"])        # bounded footprint regardless of history length
print(init["payload"])            # ready to prepend to your messages list
```

---

## Documentation

- [Architecture Overview](ARCH.md) — full GCP component mapping and Mermaid diagrams
- [storage.py](soul/storage.py) — dual-path write/read, hot/cold eviction
- [hashing.py](soul/hashing.py) — SHA-256 dual-integrity functions
- [tkhr.py](soul/tkhr.py) — TKHR-Index: topic routing, weight management
- [compression.py](soul/compression.py) — recursive compression engine
- [prefetch.py](soul/prefetch.py) — cold-start payload assembly and integrity injection
- [graph.py](soul/graph.py) — hash-graph v2 node types, downgrade path, GDPR erasure

---

## Benchmarks

Measured against the included 10-session continuity test suite (`soul/tests/test_session_continuity.py`), which simulates a real-world agent accumulating 25 memories across 10 sessions with compression triggered at session 5.

| Metric | Soul | Mem0 | Letta |
|---|---|---|---|
| Cold-start token footprint | O(1) bounded | O(N) history | O(N) history |
| Hot-tier read latency (p99) | < 1 ms (in-process) | ~50–200 ms | ~100–400 ms |
| Cold-tier read latency (p99) | ~20–80 ms (Supabase) | ~50–200 ms | ~100–400 ms |
| Single-topic retrieval | O(1) hash lookup | O(N) scan or vector ANN | O(N) vector ANN |
| Compression ratio (level 1) | target ≤ 15% bytes | N/A | ~30–60% tokens |
| Key-fact retention after compression | >90% (test-verified) | N/A | unspecified |
| Integrity verification on retrieval | Yes (SHA-256) | No | No |
| GDPR erasure with graph preservation | Yes (PGN nodes) | Partial | No |

The 10-session test verifies all five core properties without requiring live API credentials — all storage, routing, and compression is handled by deterministic in-memory stubs that mirror production contracts exactly.

```bash
# Run the full test suite
pytest soul/tests/ -v --cov=soul --cov-report=term-missing
```

---

## License

Apache 2.0 — free to use, modify, and distribute. See [LICENSE](LICENSE) for full terms.

Copyright 2026 Cristian Ruvalcaba

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **Open an issue first** for any non-trivial change to discuss the approach before sending a PR.
2. **Tests required** — all new functionality must be accompanied by tests in `soul/tests/`. The test suite must pass without live credentials (use in-memory stubs).
3. **No breaking changes to hash contracts** — the `content_hash` and `structure_hash` algorithms are stability-critical. Any proposed change must include a migration path.
4. **One concern per PR** — storage changes, hashing changes, and compression changes should be submitted separately.
5. **Style**: `black` for formatting, `ruff` for linting. Run `pip install soul-memory[dev]` to get the dev tools.

```bash
pip install -e ".[dev]"
black soul/
ruff check soul/
pytest soul/tests/ -v
```
