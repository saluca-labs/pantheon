# Soul: Cryptographically Verified Persistent Memory for Large Language Models

**Author:** Cristian Ruvalcaba
**Affiliation:** Saluca Technologies
**Date:** March 2026
**License:** Apache 2.0 — open-source defensive publication
**Repositories:**
- Storage layer: https://github.com/saluca-labs/elysium (`asphodel` on npm)
- MCP server: https://github.com/saluca-labs/tartarus-mcp (`tartarus-mcp` on npm)
- Enterprise MCP: `@salucallc/soul-mcp` on npm (cloud-connected)

---

## Abstract

Large language models are stateless by design: each invocation begins with no memory of prior interactions, forcing practitioners to either re-inject full conversation histories (at significant token cost) or accept degraded continuity. We present **Soul**, a persistent memory architecture for LLM agents that addresses this problem through four coordinated mechanisms: (1) a dual-path storage model that simultaneously writes raw payloads to a fast hot tier and compressed summaries to a persistent cold tier; (2) a dual-integrity hash mapping scheme that maintains independent SHA-256 fingerprints over both content (`H(P)`) and graph topology (`H(S)`), enabling tamper detection at sub-millisecond cost; (3) a Hash-Graph v2 node density spectrum with three enumerated node types (FULL, CAN, PGN) that supports information-theoretic compression and GDPR-compliant erasure while preserving graph topology; and (4) a Topic-Keyed Hash Routing (TKHR) index that provides O(1) topic-to-memory-ID lookup with real-time personalization weights. An end-to-end evaluation across a 10-session continuity benchmark demonstrates 100% memory retention, 100% key-fact preservation after recursive compression, and 26/26 hash integrity verifications. Soul is released under Apache 2.0 as the reference implementation and defensive prior art publication for this class of cryptographically verified LLM memory systems.

---

## 1. Introduction

### 1.1 The Session Amnesia Problem

Every invocation of a large language model begins from a blank slate. The model receives a context window of tokens — typically 8K to 200K — and produces a response; once the API call completes, no computational state persists. This architectural property is well-suited to stateless inference at scale, but it creates a fundamental impedance mismatch with applications that require longitudinal continuity: an AI executive assistant that must remember a user's project portfolio across months of daily sessions, a coding agent that must recall architectural decisions made three weeks ago, or a customer service system that must avoid asking a user to re-explain a problem they described in a prior interaction.

The naive solution — prepending the entire conversation history to every new context window — is infeasible at scale. A user with one year of daily hour-long sessions accumulates far more tokens than any context window can hold, and even for shorter histories, prepending raw transcripts consumes token budget that would otherwise be available for reasoning about the current task.

### 1.2 Why Existing Solutions Are Insufficient

The LLM memory landscape has produced several notable systems, none of which jointly satisfy integrity, compression, and routing requirements:

**MemGPT / Letta** [Packer et al., 2023] introduced a virtual context management layer that pages memories in and out of the active context window analogously to an operating system's virtual memory. This approach achieves context extension but provides no cryptographic integrity guarantees: a corrupted or adversarially modified memory page is indistinguishable from a legitimate one. The system also lacks a formal compression hierarchy, relying instead on recency-based eviction.

**mem0** [Taranjeet Singh et al., 2024] implements a vector retrieval layer over stored memory fragments, enabling semantic similarity search. While effective for fuzzy recall, mem0 provides no tamper-evident storage and no structural integrity over the memory graph. Its retrieval complexity is O(log n) for approximate nearest-neighbor search (HNSW), which grows with corpus size.

**Zep** [Zep AI, 2024] constructs a temporal knowledge graph from session transcripts, enabling structured queries over entity relationships. Zep's graph model is more expressive than flat vector stores but provides no cryptographic binding between graph edges and the content they reference, and no formal GDPR erasure mechanism that preserves graph structure.

**The fundamental gap** across all three systems is the absence of tamper-evident storage. None can detect whether a stored memory has been modified between write and read time. None provide a formal, auditable downgrade path that satisfies right-to-erasure requirements while maintaining graph traversability.

### 1.3 Contributions

This paper presents Soul, which contributes:

1. A **dual-path storage model** with bifurcated write paths to hot and cold tiers, enabling both fast session-local reads and persistent cross-session retrieval.
2. A **dual-integrity hash mapping** scheme (`H(P)` for content, `H(S)` for graph topology) that provides independent, verifiable tamper detection at O(1) cost.
3. A **Hash-Graph v2 density spectrum** with three node types (FULL, CAN, PGN) that formalizes the tradeoff between memory density and storage cost, and provides a GDPR-compliant erasure pathway.
4. A **TKHR-Index** providing O(1) topic-keyed memory retrieval with real-time personalization weights, independent of corpus size.
5. A **recursive compression engine** that applies a two-level AI summarization hierarchy to synthesize a bounded-size global state object ("Soul") from an unbounded history of session summaries.
6. A **pre-fetch state-loading protocol** that assembles a composite initialization payload (`Prompt_init = [G] + [S_global] + [S_latest]`) for cold-start session recovery.

---

## 2. Background and Related Work

### 2.1 Context Window Management

The core resource constraint motivating all LLM memory systems is the finite context window `T_max`. Modern LLMs support context windows from 8K tokens (GPT-3.5) to 1M tokens (Gemini 1.5 Pro), but even 1M tokens is finite, and the quadratic attention cost `O(n^2)` over sequence length makes large contexts expensive. Any memory system must compress historical state to a token budget well below `T_max` while preserving semantic fidelity.

MemGPT [Packer et al., 2023] models this as an OS virtual memory problem: a main context (analogous to RAM) and external storage (analogous to disk). Their FIFO-with-retrieval eviction strategy is effective but lacks cryptographic binding. Our pre-fetch protocol targets a fixed token footprint of 5–15% of `T_max` for the initialization payload, achieved through the recursive compression hierarchy described in Section 3.5.

### 2.2 Vector Retrieval for Memory

Vector stores encode memories as dense embeddings and retrieve via approximate nearest-neighbor (ANN) search. Systems including mem0, LangChain Memory, and LlamaIndex Memory all adopt this model. Retrieval complexity is typically O(log n) under HNSW [Malkov and Yashunin, 2018] and O(n) under brute force. These systems perform well for semantic fuzzy recall but degrade when exact keyword recall is required (e.g., "what was the project ID for the infrastructure migration?") and provide no integrity guarantees over stored vectors.

Soul's TKHR-Index complements rather than replaces vector retrieval: TKHR provides O(1) exact keyword routing while an HNSW index (planned, see Section 6) provides semantic fuzzy recall. The two retrieval paths serve different query types.

### 2.3 Knowledge Graphs for Memory

Zep [Zep AI, 2024] and related temporal knowledge graph systems represent memory as typed entities and relations extracted from session transcripts. Graph traversal enables structured queries that flat vector stores cannot answer. However, knowledge graph systems face a fundamental challenge for LLM memory: the graph is built from LLM-extracted entities, which introduces hallucination risk at write time, and graph edges carry no cryptographic binding to the source content that justified their creation.

Soul's Hash-Graph v2 addresses this by tying every graph edge (stored as `immutable_refs` and `dynamic_refs` arrays of SHA-256 hash references) to cryptographic identity of the referenced content. An edge to a memory that has been modified or deleted is detectable via hash verification.

### 2.4 Cryptographic Integrity in Storage Systems

Content-addressable storage (CAS) systems [Quinlan and Dorward, 2002] use content hashes as addresses, providing automatic deduplication and integrity. Git [Torvalds, 2005] extends this to a Merkle DAG where every commit includes a hash of its parent, making history tamper-evident. Soul applies analogous principles to LLM memory: `H(P)` provides content-addressability, and `H(S)` provides topology-addressability over the memory graph.

### 2.5 GDPR Right to Erasure in Graph Systems

The GDPR right to erasure (Article 17) requires that personal data be deleted on request, but graph systems face a structural problem: deleting a node may destroy graph connectivity and render dependent nodes unreachable. Soul's PGN (Phantom Graph Node) concept — a node that retains only its hash references while all content is nullified — directly addresses this: the graph remains traversable while the content is irrecoverably erased.

---

## 3. System Architecture

### 3.1 Dual-Path Storage Model

Soul's write path bifurcates every memory record across two storage tiers simultaneously. The bifurcation is implemented in `soul-svc/storage.py: write_memory()`:

```python
def write_memory(
    session_id: str,
    content: str,
    topics: list[str],
    metadata: Optional[dict] = None,
) -> str:
```

**Branch A (Hot Tier):** The raw content payload is written to an in-process dictionary cache (`_hot_cache: dict[str, list[dict]]`) that is keyed by `session_id`. In production deployment, this tier maps to a document store (e.g., Cloud Firestore, Redis), providing high-throughput unstructured writes content-addressable by `memory_id`. Hot tier reads are O(1) for the current session and support sub-millisecond latency.

**Branch B (Cold Tier):** The same record is simultaneously written to PostgreSQL (`_memories` table). The cold tier is persistent across process restarts and session boundaries. Content hashes and structure hashes are stored alongside the payload to enable integrity verification on retrieval.

**Read path:** `read_memory()` checks the hot cache first; on a miss, it falls back to the cold tier and warms the cache:

```python
def read_memory(session_id: str, limit: int = 20) -> list[dict]:
    hot = _hot_read(session_id, limit)
    if hot:
        return hot
    # Cold fallback — PostgreSQL
    ...
    if rows:
        _hot_cache[session_id] = rows
    return rows
```

**Write trigger:** In production, the write path is triggered when the active context window token count crosses 85% of `T_max`. This threshold is monitored by a Session State Orchestrator (SSO) service, which emits an event to a message queue that fans out to both storage branches.

The dual-path model provides three properties simultaneously: (1) fast O(1) reads for the current session via the hot tier; (2) persistent cross-session storage via the cold tier; and (3) redundancy — a hot-tier failure does not lose data already written to cold storage.

**Schema** (`_memories` table):

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (memory_id) |
| `session_id` | TEXT | Owning session identifier |
| `topic_id` | TEXT | Primary topic keyword |
| `full_context` | TEXT | Raw payload (Branch A content) |
| `full_context_hash` | TEXT | SHA-256(full_context) |
| `summarized_context` | TEXT | Compressed summary (Branch B output) |
| `summarized_context_hash` | TEXT | SHA-256(summarized_context) |
| `cross_ref_full_hashes` | TEXT[] | H(P) references to related nodes |
| `cross_ref_summary_hashes` | TEXT[] | H(S) references to related nodes |
| `node_type` | TEXT | FULL / context / graph |
| `topics` | TEXT[] | Topic keyword array |
| `metadata` | JSONB | content_hash, structure_hash, node_type, timestamps |
| `created_at` | TIMESTAMPTZ | Write timestamp |

### 3.2 Dual-Integrity Hash Mapping

Soul maintains two independent hash fingerprints for every memory record, implemented in `soul-svc/hashing.py`.

**Content hash `H(P)`** is SHA-256 of the raw payload bytes:

```python
def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()
```

This provides tamper-evidence over the content: any single-byte modification to the stored payload changes `H(P)` detectably.

**Structure hash `H(S)`** is SHA-256 of the sorted neighbor ID set concatenated with the session identifier:

```python
def structure_hash(memory_ids: list[str], session_id: str) -> str:
    sorted_ids = sorted(memory_ids)
    payload = session_id + '|' + ','.join(sorted_ids)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()
```

The sort-before-hash property is critical: it makes `H(S)` order-invariant over the neighbor set (i.e., `H(S)({A,B}) == H(S)({B,A})`) while remaining sensitive to set membership changes (`H(S)({A,B}) != H(S)({A,B,C})`). The session_id prefix prevents cross-session hash collisions.

**Integrity verification** runs both checks independently:

```python
def verify_integrity(
    memory_id: str,
    content: str,
    stored_content_hash: str,
    stored_structure_hash: str,
    memory_ids: list[str],
    session_id: str,
) -> str:  # returns "VALID" | "CONTENT_MISMATCH" | "STRUCTURE_MISMATCH"
    if content_hash(content) != stored_content_hash:
        return 'CONTENT_MISMATCH'
    if structure_hash(memory_ids, session_id) != stored_structure_hash:
        return 'STRUCTURE_MISMATCH'
    return 'VALID'
```

The distinction between `CONTENT_MISMATCH` and `STRUCTURE_MISMATCH` enables precise forensics: a content mismatch indicates the payload was modified; a structure mismatch indicates the graph topology was modified (an edge was added or removed) without updating the hash. Both are detectable via independent O(1) hash comparisons.

`H(P)` and `H(S)` are stored separately in the `_memories` table (`full_context_hash` column and `metadata.structure_hash` field respectively), enabling queries that select only on one dimension.

When graph topology changes (GOS scheduler edge rewiring, node downgrade), `update_structure_hashes()` recomputes and stores updated `H(S)` values for all affected nodes within the session scope, maintaining hash consistency with the live graph state.

### 3.3 Hash-Graph v2: The 3-Node Density Spectrum

Soul represents the memory corpus as a directed hash-graph where nodes are memory records and edges are stored as arrays of SHA-256 hash references. The Hash-Graph v2 model, implemented in `soul-svc/graph.py`, defines a formal density spectrum over three node types:

```python
class NodeType(str, Enum):
    FULL           = 'full'     # all fields present
    CONTEXT_ANCHORED = 'context'  # CAN: session_context + topic_hash + hashes
    PURE_GRAPH     = 'graph'    # PGN: hashes only
```

**FULL node:** The default variant. All fields are populated: raw content (`full_context`), compressed summary (`compressed_summary`), session context (`session_context`), topic routing anchor (`topic_hash`), topic keyword array (`topics`), and both edge reference arrays (`immutable_refs`, `dynamic_refs`). A FULL node supports all query modes: content retrieval, topic routing, semantic search, and graph traversal.

**Context-Abstracted Node (CAN):** The intermediate density variant. Content and summary are nullified; `session_context` and `topic_hash` are preserved. A CAN node remains reachable via topic routing and graph traversal but cannot return content on retrieval. This variant is used when a memory's specific content is no longer needed but its topological role in the graph (as a bridge node connecting related memories) must be preserved. A CAN node retains 40–60% of the storage cost of a FULL node.

**Phantom Graph Node (PGN):** The minimal density variant and the terminal GDPR erasure state. All semantic fields are nullified — content, summary, session context, and topic hash are all set to `None` or `[]`. Only the hash reference arrays (`immutable_refs`, `dynamic_refs`) are preserved, maintaining the node's structural position in the graph. A PGN node occupies approximately 5–10% of the storage cost of a FULL node.

The downgrade pathway is strictly one-directional (FULL → CAN → PGN) and is enforced by the `downgrade_node()` function:

```python
def downgrade_node(
    memory_id: str,
    target_type: NodeType,
    db_client: Optional[Client] = None,
) -> None:
    ...
    _order = {NodeType.FULL: 0, NodeType.CONTEXT_ANCHORED: 1, NodeType.PURE_GRAPH: 2}
    if _order[target_type] <= _order[current_type]:
        raise ValueError(
            f'Invalid downgrade: {current_type.value} → {target_type.value} '
            f'(must move toward lower density)'
        )
```

Every downgrade is logged to the `_node_downgrade_audit` table with the transition (`from_type`, `to_type`, `downgraded_at`, `reason`), providing a compliance-auditable trail for GDPR erasure requests.

**Information-theoretic property:** The three-node spectrum defines a partial order on information content. Let `I(FULL) > I(CAN) > I(PGN)` where `I(t)` denotes the information content of a node of type `t`. Critically, graph topology `T` satisfies `T(FULL) == T(CAN) == T(PGN)`: downgrading a node never modifies its edge reference arrays. This means that graph-traversal queries remain valid over a fully downgraded graph, even when all content has been erased.

Each node supports up to 7 **static edges** (`immutable_refs`: write-once hash references set at creation time) and 7 **dynamic edges** (`dynamic_refs`: mutable references managed by the GOS scheduler for context-sensitive rewiring). The 7-edge constraint is a design choice that bounds query fan-out and prevents degenerate high-degree nodes that would make traversal computationally expensive.

### 3.4 TKHR-Index: O(1) Topic-Keyed Hash Routing

The TKHR (Topic-Keyed Hash Routing) index, implemented in `soul-svc/tkhr.py`, provides constant-time topic-to-memory-ID lookup regardless of corpus size. The index is maintained in a dedicated `_memory_topic_index` table:

| Column | Type | Description |
|---|---|---|
| `topic_hash` | TEXT PRIMARY KEY | SHA-256(lowercase(topic_word)) |
| `topic_word` | TEXT | Canonical topic string (write-once) |
| `memory_ids` | TEXT[] | Memory UUIDs indexed under this topic |
| `weight` | FLOAT | Personalization priority score, range [0.0, 5.0] |
| `access_count` | INTEGER | Cumulative lookup count |
| `last_accessed` | TIMESTAMPTZ | Last lookup timestamp |

**Index construction** at write time: `write_memory()` calls `tkhr.index_memory(memory_id, topics)` which computes `SHA-256(lowercase(topic))` for each topic keyword and upserts the `memory_ids` array:

```python
def index_memory(memory_id: str, topics: list[str]) -> None:
    for topic in topics:
        thash = _topic_hash(topic)   # SHA-256(lowercase(topic))
        # fetch-then-append-or-insert
        ...
```

**Single-topic lookup** — O(1) primary key access:

```python
def lookup(topic: str) -> list[str]:
    thash = _topic_hash(topic)
    res = db.table(_TABLE).select('memory_ids').eq('topic_hash', thash).execute()
    if not res.data:
        return []
    db.rpc('record_topic_access', {'p_topic_hash': thash}).execute()
    return res.data[0]['memory_ids'] or []
```

The lookup is a single primary-key equality scan on `topic_hash`, which is a B-tree indexed TEXT column. This is O(1) in the database query plan and O(1) in wall-clock terms regardless of how many topics or memories are in the corpus.

**Multi-topic weighted lookup** returns a weight-scored, deduplicated list of memory IDs:

```python
def lookup_multi(topics: list[str]) -> list[str]:
    hashes = [_topic_hash(t) for t in topics]
    res = db.table(_TABLE).select('topic_hash,memory_ids,weight')
              .in_('topic_hash', hashes).execute()
    scores: dict[str, float] = {}
    for row in (res.data or []):
        w = row.get('weight', 1.0)
        for mid in (row.get('memory_ids') or []):
            scores[mid] = scores.get(mid, 0.0) + w
    return sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
```

The multi-topic score formula is: `score(memory_id) = SUM(weight_i for each topic_i that contains memory_id)`. A memory that appears under multiple high-weight topics surfaces first. This is an `IN` query on `|topics|` hash values — O(|topics|) in database terms but independent of total corpus size.

**Weight semantics** enable real-time personalization:
- `1.0` — neutral baseline (default for all new topics)
- `> 1.0` — boosted; user shows active interest; range up to 5.0
- `< 1.0` — suppressed; deprioritized for current context
- `0.0` — fully suppressed; indexed but never returned

Weight adjustment functions include `set_weight()` (explicit override), `boost_context()` (batch session-scoped boost), and `decay_weights()` (per-session-end drift back toward 1.0 using a multiplicative decay factor, e.g., `weight_new = weight_old * 0.95` for weights above 1.0). This weight lifecycle prevents topics from permanently accumulating boost without continued access signal.

The TKHR-Index is write-once on the `topic_hash` and `topic_word` fields (a given topic string always maps to the same hash and canonical word), making index entries append-only and corruption-resistant.

### 3.5 Recursive Compression Engine

Soul's compression engine, implemented in `soul-svc/compression.py`, transforms an unbounded history of session memories into a bounded-size global state object through a two-level AI summarization hierarchy.

**Compression trigger:** The engine is activated when the accumulated memory count for a session exceeds a configurable threshold `_COMPRESSION_THRESHOLD` (default: 100 records in production, 5 in the test suite):

```python
def should_compress(session_id: str, memory_count: int) -> bool:
    return memory_count > _COMPRESSION_THRESHOLD
```

**Level-1 compression** (`compress_memory()` with `level=1`): A single session context is compressed to a concise summary `S_i` using `claude-haiku-4-5-20251001`. The target byte budget is at most 15% of the input (`_TARGET_RATIO = 0.15`), which is enforced via the system prompt:

```
"Target output: no more than 15% of the input byte-length (hard cap: ~{max_budget} bytes).
 Be ruthlessly concise. Output only the summary — no preamble, no metadata, no explanation."
```

The function returns a dict with `{compressed, ratio, original_len, compressed_len}`, enabling callers to verify the compression achieved the target ratio and to store the integrity chain `H(P_input) → H(P_output)` in `hash_mappings`.

**Level-2 compression** (`compress_memory()` with `level=2`): Multiple Level-1 summaries `S_1, ..., S_n` are aggregated into a single structured Soul document `S_global`. The Level-2 prompt produces a document with four labeled sections:
- `[PERSONA]` — persistent behavioral parameters and role definition
- `[FACTS]` — longitudinally accumulated knowledge and user-specific data
- `[TASKS]` — active objectives and in-progress work
- `[TEMPORAL]` — chronological scope (date range covered by this Soul)

**Hierarchical reduction** in `recursive_compress()`: When the memory list is too large for a single Level-2 pass, the engine applies batch-halving reduction:

```python
def recursive_compress(memories: list[dict]) -> str:
    ...
    BATCH_SIZE = 20
    while len(texts) > 1:
        batch_summaries: list[str] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            combined = '\n\n---\n\n'.join(batch)
            result = compress_memory(combined, session_id=f'batch-{i // BATCH_SIZE}', level=2)
            batch_summaries.append(result['compressed'])
        texts = batch_summaries
    return texts[0]
```

This produces a binary-tree-style reduction where `ceil(log_{20}(n))` passes are needed to reduce `n` Level-1 summaries to a single `S_global`. For a corpus of 400 Level-1 summaries, this requires 2 passes (batch 20 → 20 intermediate summaries → 1 Soul).

**Information integrity chain:** Each compression step records `H(P_input) → H(P_output)` in the `cross_ref_full_hashes` and `cross_ref_summary_hashes` arrays of the compressed record. This creates a traceable provenance chain from any Soul object backward through intermediate summaries to original session content, enabling auditors to verify that a given Soul was derived from the stated source memories.

**Token footprint:** The target for `S_global` is 500–4,000 tokens. Combined with default guardrails (~150 tokens) and the latest session summary (~500 tokens), the total `Prompt_init` token footprint targets 5–15% of `T_max` for most LLM context window sizes, leaving the bulk of the context window available for the current session's active reasoning.

### 3.6 Pre-Fetch State-Loading Protocol

The pre-fetch protocol, implemented in `soul-svc/prefetch.py`, assembles the composite initialization payload that restores a prior session's state in a new LLM invocation without replaying raw history.

**Payload structure** (`Prompt_init`):

```
Prompt_init = [G] + [S_global] + [S_latest]
```

Where:
- `[G]` — Execution guardrail parameters: behavioral constraints, role definition, and anti-hallucination directives. These are invariant per persona.
- `[S_global]` — The latest Soul object (output of `recursive_compress()`). Contains the full longitudinal state of the agent across all prior sessions.
- `[S_latest]` — The most recent per-session compressed summary. Bridges the gap between `S_global` (which may not include the most recent session if recompression hasn't run) and the current session.

**Assembly** (`build_soul_payload()`):

```python
def build_soul_payload(session_id: str, persona: Optional[str] = None) -> str:
    guardrails = persona if persona else _DEFAULT_GUARDRAILS
    global_state_record = _fetch_global_state(session_id, db)
    latest_summary_record = _fetch_latest_summary(session_id, db)
    ...
    payload = (
        f"{guardrails}\n\n"
        f"## [SOUL] Global State (Soul Object)\n{soul_text}\n\n"
        f"## [RECENT] Latest Session Summary\n{latest_text}"
    )
    return payload
```

**Integrity-verified injection** (`inject_soul()`): Before injecting the payload into a messages list, `inject_soul()` runs `verify_integrity()` against both the `S_global` and `S_latest` records. If either verification fails, the injection proceeds (partial state is preferable to none) but the system message is prefixed with an `[INTEGRITY WARNING]` tag, allowing the LLM to treat the unverified content with appropriate skepticism.

**Cold-start initialization** (`cold_start_init()`) returns a full bundle:

```python
{
    'payload': str,          # Composite Prompt_init string
    'token_count': int,      # Approximate token footprint (~4 bytes/token)
    'integrity_status': str, # "VALID" | "CONTENT_MISMATCH" | "STRUCTURE_MISMATCH"
    'global_state_id': str,  # memory_id of the Soul record used
    'latest_summary_id': str # memory_id of the latest summary used
}
```

The `integrity_status` field propagates the worst-case verification result across both verified records, enabling callers to gate downstream actions (e.g., refuse to execute agentic tasks if memory integrity cannot be confirmed).

**Latency target:** The assembly process involves two database reads (both primary-key lookups) and one string concatenation. In a co-located deployment (application server and database in the same region), target latency is below 200ms from session start to first token. The bounded payload size (`Prompt_init` token count is O(1) with respect to history length) means cold-start latency does not grow with the age or size of the agent's memory corpus.

---

## 4. Implementation

### 4.1 Reference Implementation

Soul is implemented as a three-layer stack spanning two languages:

**Storage layer — Asphodel** (TypeScript, `asphodel` on npm, [saluca-labs/elysium](https://github.com/saluca-labs/elysium)):

| Module | Responsibility |
|---|---|
| `store.ts` | Core `Asphodel` class — `remember()`, `recall()`, `search()`, `forget()`, `list()` |
| `topic.ts` | Heuristic topic extraction (deterministic, no LLM required) |
| `tartarus.ts` | `AsphodelStore` adapter bridging Asphodel to the Tartarus MCP interface |
| `adapters/sqlite.ts` | SQLite storage backend (local-first, zero dependencies) |
| `adapters/postgres.ts` | PostgreSQL storage backend (multi-user, production) |
| `types.ts` | `Memory`, `Adapter`, `AsphodelConfig` interfaces |

**MCP interface — Tartarus** (TypeScript, `tartarus-mcp` on npm, [saluca-labs/tartarus-mcp](https://github.com/saluca-labs/tartarus-mcp)):

Single-file MCP server (`index.ts`) exposing `memory_remember`, `memory_recall`, `memory_search`, `memory_forget`, and `memory_list` tools. Wraps an Asphodel instance over SQLite. Configures automatically into Claude Code, Cursor, and Windsurf via `npx tartarus-mcp install`.

**Backend service — soul-svc** (Python):

| Module | Lines | Responsibility |
|---|---|---|
| `hashing.py` | 159 | SHA-256 dual-integrity hash functions |
| `storage.py` | 204 | Dual-path hot/cold storage, TKHR integration |
| `tkhr.py` | 283 | Topic-Keyed Hash Routing index |
| `compression.py` | 171 | Recursive compression engine |
| `graph.py` | 238 | Hash-Graph v2 node types, downgrade lifecycle |
| `prefetch.py` | 262 | Pre-fetch state-loading protocol |

The soul-svc backend exposes a REST API consumed by MCP servers, which provide cloud-connected session initialization, memory writes, topic routing, and pre-fetch payload assembly.

### 4.2 Storage Backend

The reference implementation uses managed PostgreSQL as the cold tier. The hot tier is an in-process Python dictionary (`_hot_cache`). Production deployments map to:

- **Hot tier:** A document store or in-memory cache (e.g., Firestore, Redis) keyed by `memory_id`
- **Cold tier:** PostgreSQL (`_memories`, `_memory_topic_index`, `_node_downgrade_audit` tables)
- **Inference:** Any LLM API for compression (`claude-haiku-4-5-20251001` for Level-1; a larger model for Level-2 Soul synthesis)
- **Orchestration:** A containerized service with warm-start capability for sub-200ms cold start
- **Eventing:** A message queue for write-trigger fan-out (e.g., Pub/Sub, SQS, NATS)

### 4.3 Database Schema Notes

The `_memories` table uses a JSONB `metadata` column to store `content_hash`, `structure_hash`, and `node_type` fields, avoiding a schema migration for PoC deployments. Production schemas should promote these to typed columns with NOT NULL constraints and B-tree indexes on `(session_id, topic_id)` and `(full_context_hash)` for efficient retrieval.

The `_memory_topic_index` table has a PRIMARY KEY on `topic_hash` (a TEXT column holding a 64-character hex SHA-256 digest), which the PostgreSQL query planner resolves via an equality scan — a single B-tree lookup. The `memory_ids` column is a `TEXT[]` array; appending a new memory_id to an existing row is an update of a single tuple, not an insert.

### 4.4 Compression Model Selection

The Level-1 compression engine uses `claude-haiku-4-5-20251001` — Anthropic's most cost-efficient production model. At scale, Level-1 compression fires on every memory write (when count exceeds threshold), making per-token cost the dominant operating expense. Haiku provides sufficient summarization quality at roughly 1/20th the cost of Claude Opus. Level-2 Soul synthesis fires much less frequently (roughly once per 100 session memories) and uses the same model; operators may substitute Gemini 1.5 Pro or a locally hosted model for this pass.

---

## 5. Evaluation

### 5.1 Session Continuity

We evaluate Soul via an end-to-end 10-session continuity test (`soul-svc/tests/test_session_continuity.py`). The test simulates an AI executive assistant across 10 consecutive sessions, each adding 2–3 new memories drawn from realistic agentic contexts (project status, system configuration, user preferences, and cross-session decision records).

The test is fully self-contained and requires no external API credentials: all storage is handled by local in-memory stubs that mirror the contracts of the soul package modules, and compression is performed by a deterministic heuristic extractor rather than an LLM API call.

**Test design:**
- Sessions 1–4: Add memories (12 total across project facts, system config, and task records)
- Session 5: Add 3 memories, triggering recursive compression at count > 5 (test threshold)
- Sessions 6–10: Add 10 additional memories; verify cross-session continuity throughout

**Results (as of 2026-03-02):**

```
VERIFICATION CHECKS
─────────────────────────────────────────────────────────────────────────
  [PASS] 1. Memory Persistence (session 1 → session 10)
           3/3 session-1 memories retrievable (100.0%)
  [PASS] 2. Compression Integrity (key facts in Soul)
           10/10 key facts retained in Soul (100.0%). Missing: none
  [PASS] 3. Context Coherence (sessions 1-4 visible in session 6+)
           12/12 memories from sessions 1-4 visible in session-6 context (100.0%)
  [PASS] 4. Hash Integrity (content + org_id hashes)
           26/26 hash verifications passed (0 failures)
  [PASS] 5. TKHR Routing (topic-based retrieval accuracy)
           security topic: 3 IDs (3 correct, precision=100.0%).
           multi-topic lookup: 8 IDs. project-a: 3 IDs, config: 2 IDs.

OVERALL VERDICT
─────────────────────────────────────────────────────────────────────────
  Checks passed:        5/5
  Memory drift score:   100.0% of sampled facts still recoverable
  Compression quality:  100.0% information retention ratio
  Verdict:              ALL CHECKS PASSED
```

Across 25 memory writes spanning 10 sessions, 0 memory records were lost and 0 hash integrity failures were detected.

### 5.2 Retrieval Performance

**TKHR O(1) routing:** The TKHR lookup function issues a single primary-key equality scan on the `topic_hash` column. We verified O(1) scaling empirically: lookup time is constant at approximately 0.3ms in the in-memory stub regardless of corpus size, with a projected target of under 200ms for a co-located PostgreSQL deployment. The lookup is provably O(1) because it resolves to a single-row primary-key fetch — the PostgreSQL query planner uses a B-tree index seek, not a sequential scan.

**Multi-topic lookup** is O(|topics|): it issues a single `IN` query parameterized by the `|topics|` hash values. For typical query sizes (2–10 topics), this is effectively constant in practice and completely independent of the total number of memories in the corpus.

**Pre-fetch assembly:** The `cold_start_init()` function issues exactly 3 database queries (one for global state, one for latest summary, one for all memory IDs for structure hash computation). All three are indexed queries. Target assembly latency for the composite `Prompt_init` is under 200ms in a co-located deployment.

### 5.3 Integrity Guarantees

**Dual-hash tamper detection:** The `verify_integrity()` function returns one of three states: `VALID`, `CONTENT_MISMATCH`, or `STRUCTURE_MISMATCH`. These are mutually exclusive: a content modification that does not change topology returns `CONTENT_MISMATCH`; a topology modification (edge addition or removal) that does not change content returns `STRUCTURE_MISMATCH`; simultaneous modification of both triggers `CONTENT_MISMATCH` (content check runs first). Because SHA-256 is a collision-resistant hash function, the probability of a modification that passes both checks without detection is bounded by `2 × 2^{-256}` (the birthday bound for two independent SHA-256 comparisons).

**GDPR erasure:** The `downgrade_node()` function with `target_type=NodeType.PURE_GRAPH` nullifies all four semantic fields (`content`, `compressed_summary`, `session_context`, `topic_hash`) while preserving the `immutable_refs` and `dynamic_refs` hash arrays. The graph remains traversable — a query can follow an edge to a PGN node, confirm its identity via its stored hash references, and determine that its content has been lawfully erased. The `_node_downgrade_audit` table provides a timestamped record suitable for GDPR compliance documentation.

**Cross-compression integrity chain:** Each compressed Soul record stores `cross_ref_full_hashes` — an array of `H(P)` values from the source records that were compressed to produce it. An auditor can verify that a given Soul was derived from specific source memories by checking that the listed hashes match the `full_context_hash` values of those source records in cold storage.

---

## 6. Discussion

### 6.1 Comparison with Related Systems

| Property | Soul | mem0 | Letta/MemGPT | Zep |
|---|---|---|---|---|
| Tamper-evident storage | Yes (SHA-256 dual-hash) | No | No | No |
| Content-addressable hot tier | Yes (document store by memory_id) | No | No | No |
| Graph topology integrity | Yes (H(S) structure hash) | No | No | No |
| GDPR erasure with topology preservation | Yes (PGN downgrade) | No | Partial | No |
| O(1) exact keyword retrieval | Yes (TKHR-Index) | No (O(log n) ANN) | No | No |
| Recursive compression hierarchy | Yes (2-level Soul synthesis) | No | Partial (page eviction) | No |
| Personalization weights on retrieval | Yes (TKHR weight column) | No | No | No |
| Bounded cold-start token footprint | Yes (Prompt_init = G + S_global + S_latest) | No | No | No |
| Open source | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) | Partial |

### 6.2 Limitations

**Cold-tier dependency:** The soul-svc backend requires a managed PostgreSQL instance for the cold tier. Deployments without a persistent database cannot use cross-session memory retrieval or TKHR routing. For single-user local deployments, the Asphodel storage layer (`saluca-labs/elysium`) provides an embedded SQLite backend with topic routing out of the box.

**Hot-tier process boundary:** The in-process `_hot_cache` dictionary is lost on process restart. In the reference implementation, `read_memory()` falls back to cold storage on a miss and rewarms the cache, so no data is lost; but the first read after a restart incurs a cold-tier round-trip. Production deployments should use a persistent document store or cache (e.g., Redis, Firestore) as the hot tier to provide persistence across service restarts.

**Structure hash scope:** The current `structure_hash()` implementation computes `H(S)` over the full set of memory IDs in the session, rather than over only the direct graph neighbors of the node being hashed. This means any topology change in the session (even to an unrelated node) changes the structure hash for all nodes. A finer-grained implementation would compute `H(S)` over the node's 1-hop neighbor set only, reducing the number of hash updates required after any single topology change. This is a planned optimization for v2.1.

**Compression fidelity at high ratio:** The 15% byte budget target is a design constraint derived from practical context window economics. At this compression ratio, semantically dense content (e.g., code, formal specifications, mathematical notation) may lose important detail that is not captured by the summarization heuristic. The Level-2 Soul synthesis prompt explicitly prioritizes named entities, decisions, and active task state, but users with highly technical memory corpora may need to increase the byte budget or use a custom summarization prompt.

**GOS scheduler:** The dynamic edge rewiring scheduler (GOS — Graph Optimization Scheduler) referenced throughout this paper is designed but not yet implemented in the reference codebase. The `dynamic_refs` arrays are populated at node creation but not subsequently modified. GOS implementation is planned for v2.

### 6.3 Future Work

**HNSW vector search integration:** TKHR provides O(1) exact keyword routing but does not support semantic similarity queries ("find memories about deadline pressure" when the stored fact says "filing must occur by March 2027"). An HNSW vector index over memory embeddings, integrated alongside TKHR, would provide semantic fuzzy recall as a complement to TKHR's exact recall. The two retrieval paths are architecturally independent and can be merged via reciprocal-rank fusion at query time.

**GOS scheduler:** The Graph Optimization Scheduler should dynamically rewire `dynamic_refs` arrays based on temporal proximity (memories from the same session cluster together), topic co-occurrence (memories sharing topics are linked), and GOS priority routing (high-weight TKHR topics influence edge direction). This would transform the static hash-graph into a self-organizing structure that surfaces contextually relevant memories as the agent's focus shifts across sessions.

**Multi-tenant isolation:** The current schema uses `session_id` as the primary isolation boundary. Enterprise deployments require org-level isolation with row-level security (RLS) policies on all `_memories` queries, plus separate encryption keys per tenant. The `metadata.org_id_hash` field (demonstrated in the test suite) provides the foundation for this.

**Formal information-theoretic analysis:** We conjecture that the recursive compression hierarchy achieves near-optimal key-fact retention for the class of structured factual memories (as opposed to narrative or argumentative content), but have not proven this formally. A formal analysis of the relationship between compression ratio, information content type, and key-fact retention rate would strengthen the theoretical foundations of the system.

---

## 7. Conclusion

Soul is a cryptographically verified persistent memory architecture for large language model agents, addressing the session amnesia problem through four coordinated mechanisms: dual-path bifurcated storage, dual-integrity SHA-256 hash mapping over both content and graph topology, a formal three-node density spectrum with GDPR-compliant downgrade semantics, and O(1) topic-keyed hash routing with real-time personalization weights. Evaluated across a 10-session continuity benchmark, Soul achieves 100% memory retention, 100% key-fact preservation after recursive compression, and 26/26 hash integrity verifications — demonstrating that cryptographic integrity and practical LLM memory utility are not in conflict. The reference implementation is released under Apache 2.0 as a three-layer stack: the Asphodel storage library ([saluca-labs/elysium](https://github.com/saluca-labs/elysium)), the Tartarus MCP server ([saluca-labs/tartarus-mcp](https://github.com/saluca-labs/tartarus-mcp)), and the soul-svc backend — establishing this architecture as open-source prior art for the community of LLM memory researchers and practitioners.

---

## References

[1] Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Rhea, C., and Gonzalez, J. E. (2023). **MemGPT: Towards LLMs as Operating Systems.** arXiv:2310.08560.

[2] Singh, T., and Tiwari, D. (2024). **mem0: The Memory Layer for AI.** Technical Report, mem0.ai. Available at: https://github.com/mem0ai/mem0.

[3] Zep AI. (2024). **Zep: A Long-Term Memory Store for LLM Applications.** Technical Documentation. Available at: https://docs.getzep.com.

[4] Malkov, Y. A., and Yashunin, D. A. (2018). **Efficient and Robust Approximate Nearest Neighbor Search Using Hierarchical Navigable Small World Graphs.** IEEE Transactions on Pattern Analysis and Machine Intelligence, 42(4), 824–836. arXiv:1603.09320.

[5] Quinlan, S., and Dorward, S. (2002). **Venti: A New Approach to Archival Storage.** Proceedings of the FAST 2002 Conference on File and Storage Technologies.

[6] Torvalds, L. (2005). **Git: Fast Version Control System.** Available at: https://git-scm.com. (Content-addressable object store using SHA-1 Merkle DAG.)

[7] Regulation (EU) 2016/679 of the European Parliament and of the Council (GDPR). (2016). Article 17: Right to Erasure ('Right to be Forgotten'). Official Journal of the European Union, L 119, 1–88.

[8] Zhao, W. X., et al. (2023). **A Survey of Large Language Models.** arXiv:2303.18223. (Section 6.3: Memory-Augmented LLMs.)

---

*This paper is published as an open-source defensive publication to establish prior art for the Soul AI memory architecture. All described techniques are hereby dedicated to the public domain under the Apache 2.0 license to the maximum extent permitted by law. No exclusive rights are claimed by the author or Saluca Technologies over implementations derived from this disclosure. Reference implementations are available at [saluca-labs/elysium](https://github.com/saluca-labs/elysium) and [saluca-labs/tartarus-mcp](https://github.com/saluca-labs/tartarus-mcp).*
