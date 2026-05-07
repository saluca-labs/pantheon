# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-013
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**Method and System for Incremental Conversational Context Transfer Using Hash-Chain Validated Rolling Root Attestation Over Bandwidth-Constrained Communication Channels**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to U.S. Provisional Patent Application Serial No. [SALUCA-012], entitled "Method and System for Covert Communication Using Steganographic Encoding Over Frozen Large Language Model Token Probability Distributions," filed concurrently herewith, the disclosure of which is incorporated herein by reference in its entirety.

SALUCA-012 discloses a steganographic encoding mechanism for embedding arbitrary payloads within AI-generated natural-language text. The present invention discloses the protocol layer that structures the payload carried by that mechanism -- the two inventions are complementary and non-overlapping. Specifically, the present invention provides the incremental context synchronization protocol whose serialized packets serve as the plaintext input to the steganographic encoder disclosed in SALUCA-012.

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of communication protocols for synchronizing conversational context between distributed computing nodes, and more particularly to a method and system for incrementally transferring an arbitrarily large conversational context using a hash-chain validated rolling root commitment, wherein the wire cost of representing acknowledged history is constant regardless of history depth. The invention encompasses static/dynamic partition architectures for conversation history, sequential cryptographic fold operations for rolling root advancement, semantic compression of context blocks using content-hash binding with natural-language summaries, replay-resistant acknowledgment mechanisms with monotonic sequence tracking, and integration with severely bandwidth-constrained or covert communication channels including steganographic transports.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

Conversational AI systems -- including large language model (LLM) based agents, chatbots, multi-agent orchestration frameworks, and autonomous agent networks -- maintain a context window representing the history of a dialogue or task. As interactions grow, this context may span thousands of turns comprising many kilobytes or megabytes of raw text. The need to synchronize this context between distributed parties arises in numerous scenarios: between a user device and a remote AI agent, between two AI agents coordinating across network boundaries, between edge devices and cloud orchestrators, and between parties communicating over surveillance-sensitive or bandwidth-limited channels.

The proliferation of multi-agent AI architectures in 2024-2026 -- including frameworks such as AutoGen, CrewAI, LangGraph, and proprietary agent orchestration systems -- has intensified the need for efficient context synchronization protocols. These systems require multiple AI agents to maintain shared conversational state across network boundaries, often with heterogeneous bandwidth constraints between agent nodes.

Naive synchronization requires retransmitting the full context window on each exchange. For a conversation of N turns averaging K bytes per turn, naive retransmission imposes O(N x K) wire cost per synchronization event. This cost grows linearly and without bound as conversations deepen, rendering naive approaches impractical for any bandwidth-constrained scenario.

### 4.2 Limitations of Existing Solutions

Several existing general-purpose synchronization and integrity verification approaches are inadequate for the problem addressed by the present invention. Each addresses a related but distinct problem domain and fails to provide the specific combination of constant-size history representation, incremental delta transfer, hash-chain integrity attestation, semantic compression, and bandwidth-constrained transport integration required for conversational context synchronization.

**Operational Transform (OT) and Conflict-Free Replicated Data Type (CRDT) Protocols.** Operational Transform protocols, as implemented in collaborative document editors such as Google Docs (Jupiter protocol), and CRDT-based systems as used in Notion, Figma, and Yjs, are designed for concurrent multi-writer editing scenarios with complex conflict resolution. OT transforms operations against concurrent edits to maintain consistency; CRDTs use mathematically commutative data structures to ensure eventual convergence without coordination. Neither OT nor CRDT protocols provide hash-chain validated history attestation -- they do not produce a cryptographic commitment to the ordered sequence of all prior operations. Both carry significant per-operation metadata overhead (operation identifiers, vector clocks, causal dependency graphs) that is unsuitable for severely bandwidth-constrained channels. Furthermore, OT/CRDT protocols address the problem of concurrent modification of a shared document, not the problem of incremental synchronization of an append-only conversation history between two parties.

**Git Content-Addressable Storage.** Git uses directed acyclic graphs (DAGs) of SHA-1/SHA-256 hashed objects (blobs, trees, commits) to represent change history. While Git's model is hash-based and provides integrity verification through its Merkle DAG structure, it is fundamentally unsuitable for real-time conversational context synchronization for several reasons: (a) Git requires full object trees to be available locally for integrity verification, imposing storage and retrieval overhead incompatible with bandwidth-constrained nodes; (b) Git does not provide a protocol for progressive rolling root advancement that reduces acknowledged history to a constant-size commitment; (c) Git's pack protocol (smart HTTP or SSH transport) is designed for batch synchronization of repository state, not streaming real-time incremental updates; and (d) Git does not incorporate semantic compression of content -- it stores full object content or binary deltas, not semantic summaries.

**Merkle Tree Based Verification (Blockchain and Certificate Transparency).** Merkle trees, as used in Bitcoin (Nakamoto, 2008), Ethereum, and certificate transparency logs (RFC 6962), provide batch integrity proofs over static or slowly-growing datasets. Merkle trees enable inclusion proofs ("this element is part of the committed set") with O(log N) proof size. However, Merkle trees are not designed for incremental streaming updates with constant-size history representation: (a) inclusion proofs grow logarithmically with dataset depth, not constant; (b) Merkle trees do not inherently separate acknowledged from pending history or provide an acknowledgment-driven root advancement mechanism; (c) the tree structure imposes overhead for maintaining balanced trees during incremental appends; and (d) Merkle trees do not address semantic compression of the underlying data elements. Recent work on append-only authenticated data structures (e.g., Reyzin and Yakoubov, "Efficient Asynchronous Accumulators for Distributed PKI," 2016) addresses cryptographic accumulator efficiency but does not address conversational context synchronization or bandwidth-constrained transport integration.

**Session Resumption Protocols (TLS).** TLS session resumption (RFC 5077, RFC 8446 Section 2.2) enables clients to resume encrypted sessions without a full handshake by presenting a session ticket containing encrypted key material. Session resumption transfers cryptographic key state, not semantic context. TLS session tickets do not represent, compress, or synchronize conversation history. The problem domain is entirely distinct: TLS resumes a cryptographic session; the present invention synchronizes a semantic conversation history.

**Signal Protocol Double Ratchet.** The Signal Protocol (Marlinspike and Perrin, 2016) implements a double ratchet algorithm that advances cryptographic key material with each message exchange, providing forward secrecy and break-in recovery. The double ratchet advances keys, not context. It does not address the transfer, representation, compression, or integrity attestation of semantic conversation content. The ratchet produces new encryption keys; the present invention produces a rolling root commitment to conversation history content.

**Hash-Chain Authentication in IoT.** Recent work on hash-chain based authentication for IoT fog/edge networks (Shahidinejad et al., "Hash-Chain Fog/Edge: A Mode-Based Hash-Chain for Secured Mutual Authentication," Sensors, 2022) uses hash chains for device authentication and session key agreement in resource-constrained environments. This work addresses authentication (proving device identity), not context synchronization (transferring and attesting conversation history). The hash chains serve as one-time password sequences, not as rolling commitments to ordered content blocks.

**Blockchain Consensus Under Bandwidth Constraints.** Research on securing Proof-of-Stake consensus under bandwidth constraints (e.g., Neu et al., "Securing Proof-of-Stake Nakamoto Consensus Under Bandwidth Constraint," arXiv:2111.12332, 2021) analyzes how bandwidth limitations affect block propagation and consensus safety. This work addresses the problem of reaching agreement on a single canonical chain among many validators, not the problem of synchronizing semantic context between two communicating parties. The hash chains in blockchain consensus serve as proof-of-work or proof-of-stake commitments, not as rolling attestations of acknowledged conversation history.

**LLM Context Window Management.** Commercial LLM providers (OpenAI, Anthropic, Google) implement context window management through token truncation, sliding windows, and retrieval-augmented generation (RAG). These approaches manage context within a single LLM inference call and do not address the problem of synchronizing context between distributed nodes over a communication channel. RAG retrieves relevant context fragments from a vector database but does not provide cryptographic integrity attestation over the retrieved context or minimize wire cost for inter-node synchronization.

**US20230259705A1** (2023) discloses methods for interacting with LLMs using structured machine-readable data to provide context and improve outputs, including hallucination avoidance. This application addresses context formatting for LLM input quality, not cryptographic synchronization of context between distributed nodes over bandwidth-constrained channels.

**US12,573,398** (2026) discloses a conversational AI platform with dialogue management. This patent addresses conversational flow control within a single platform, not incremental hash-chain validated context transfer between distributed nodes.

### 4.3 Unmet Need

There exists a need in the art for a protocol that: (a) represents acknowledged conversation history as a constant-size cryptographic commitment regardless of history depth, achieving O(1) wire cost for the acknowledged portion; (b) transmits only unacknowledged delta context on each exchange, achieving wire cost proportional only to new turns since last acknowledgment; (c) provides hash-chain integrity attestation over the full ordered history, enabling either party to detect tampering, reordering, or divergence; (d) supports semantic compression of context blocks to minimize payload volume while retaining verifiability through content-hash binding; (e) integrates with severely bandwidth-constrained transports including steganographic channels, low-bandwidth wireless links, and air-gapped communication paths; and (f) enforces replay resistance through monotonic sequence tracking with defined wraparound behavior.

No existing system, protocol, or published method provides this combination of capabilities.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a computer-implemented protocol, method, and system for incremental conversational context transfer using hash-chain validated rolling root attestation.

The key architectural insight of the invention is the partition of conversation history into two sections: a "static section" of acknowledged, fully committed history, and a "dynamic section" of pending, not-yet-acknowledged context blocks. The static section -- regardless of the number of turns it represents -- is represented on the wire by a single 32-byte rolling root hash: the SHA-256 digest of the sequential fold of all acknowledged block hashes. The dynamic section, containing only the unacknowledged delta, is the sole variable-size payload transmitted.

This architecture achieves O(1) wire cost for acknowledged history of arbitrary depth: a conversation of 10,000 turns and a conversation of 10 turns carry identical static-section wire costs (32 bytes). Only the new turns since the last acknowledgment need cross the communication channel. The total wire cost per synchronization event is 74 bytes of fixed overhead plus the compressed size of only the pending context blocks.

A second key insight is the application of semantic compression to context blocks: rather than transmitting raw conversation text, each block carries a cryptographic hash of the raw text (for deferred verification) and a short semantic summary (the "gist") of its content. This further reduces payload for channels with extremely limited capacity, achieving compression ratios of 20:1 to 30:1 relative to raw text transmission.

The protocol defines an acknowledgment mechanism by which the receiving party confirms receipt of the dynamic section, enabling the sender to promote the acknowledged delta into the static root, clearing the dynamic window for subsequent transmissions. Replay protection is enforced via a monotonically advancing sequence counter and last-acknowledged-sequence tracking. History divergence is detected via static root comparison at the start of each synchronization exchange.

In a preferred alternative embodiment, the semantic summary in each context block is computed deterministically from the raw turn text using a pre-agreed large language model and prompt template, yielding a "verifiable gist" that any authorized party can independently reproduce and audit. When the summarization model is the same frozen LLM distribution used for steganographic channel encoding (as disclosed in SALUCA-012), a single pre-shared channel artifact serves both the transport encoding function and the deterministic context summarization function.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating two communicating nodes (Node A and Node B) maintaining synchronized context chains via SYNC and ACK packets transmitted over a bandwidth-constrained communication channel, showing the context chain manager, sync packet generator, transmission module, and acknowledgment processor on each node.

**FIG. 2** is a data structure diagram illustrating the context chain architecture, depicting the static root hash (rolling hash commitment) and the dynamic window (ordered list of pending context blocks), showing the sequential fold operation that advances the static root by cryptographically incorporating each acknowledged block.

**FIG. 3** is a wire format diagram illustrating the SYNC packet structure, showing the byte layout comprising the version field (1 byte), packet type field (1 byte, value 0x53), sequence number (4 bytes), static root hash (32 bytes), dynamic data length (4 bytes), compressed dynamic data payload (variable), and combined hash (32 bytes).

**FIG. 4** is a wire format diagram illustrating the ACK packet structure, showing the byte layout comprising the version field (1 byte), packet type field (1 byte, value 0x41), sequence number (4 bytes), and new root hash (32 bytes), totaling a constant 38 bytes.

**FIG. 5** is a state machine diagram illustrating the protocol operation sequence: SYNC packet construction and transmission by the sender, receiver validation (replay rejection, duplicate detection, combined hash verification, static root comparison), dynamic window ingestion and root advancement at the receiver, ACK packet construction and transmission by the receiver, and root promotion and dynamic window clearing at the sender.

**FIG. 6** is a comparative bandwidth analysis chart illustrating the O(1) static section wire cost of the present invention versus the O(N) wire cost of naive full-context retransmission, plotted as total wire cost in bytes against conversation length in turns, demonstrating that the present invention's wire cost grows only with unacknowledged delta size while naive retransmission grows linearly with total history depth.

**FIG. 7** is a block diagram illustrating semantic compression of a context block, showing the transformation of raw turn text (approximately 3,000 bytes for a 500-word turn) into a context block comprising a content hash (32 bytes as hex-encoded 64 characters) and a semantic summary (at most 120 characters), with the resulting compressed block size of approximately 100-140 bytes representing a 20:1 to 30:1 compression ratio.

**FIG. 8** is an integration diagram illustrating the composition of the HCTP protocol with the steganographic channel disclosed in SALUCA-012, showing the HCTP SYNC packet as the plaintext input to the Hermes steganographic encoder, which encodes the packet within AI-generated natural-language cover text using arithmetic coding over a frozen LLM token probability distribution, and the reverse path for ACK packets.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 Definitions

**"Context Block"**: A unit of conversation history comprising: (a) a sequence number (seq) identifying the block's position in the conversation as a monotonically increasing unsigned 32-bit integer; (b) a role indicator identifying the originator of the turn (e.g., "user", "agent", or application-defined roles); (c) a content hash comprising the SHA-256 digest of the raw UTF-8 encoded text of the turn; and (d) a semantic summary comprising a natural-language distillation of the turn's content, not exceeding 120 characters in the preferred embodiment.

**"Static Section"**: The set of all context blocks that have been acknowledged by both communicating parties. The static section is not retransmitted on the wire; it is represented solely by the static root hash. The static section grows monotonically as acknowledgments are processed but imposes zero incremental wire cost regardless of its depth.

**"Dynamic Section"** (also "dynamic window"): The set of context blocks added since the last acknowledgment, which have not yet been incorporated into the static root. These blocks constitute the variable-size payload of a SYNC packet. The dynamic window is empty immediately after each successful acknowledgment exchange.

**"Static Root Hash"** (also "rolling root"): A 32-byte SHA-256 hash that cryptographically commits to the full ordered sequence of acknowledged context blocks. The static root hash is computed as a sequential fold:

```
root_0 = SHA-256("hctp-genesis-v1")                      [genesis constant]
root_n = SHA-256(root_{n-1} || SHA-256(serialize(B_n)))   [fold operation]
```

where B_n is the n-th acknowledged context block and serialize() produces a canonical, deterministic byte representation (sorted-key JSON with no whitespace in the preferred embodiment). The genesis constant "hctp-genesis-v1" distinguishes the protocol version and prevents cross-version root collisions. The sequential fold ensures that the root commits to both the content and the ordering of all acknowledged blocks.

**"SYNC Packet"**: A protocol data unit transmitted from sender to receiver containing the sender's current static root hash, a compressed serialization of the dynamic section, a sequence number for ordering and replay protection, and a combined hash for application-layer integrity verification.

**"ACK Packet"**: A protocol data unit transmitted from receiver to sender confirming successful ingestion of a SYNC packet and providing the updated static root hash after folding the acknowledged dynamic section into the root.

**"Combined Hash"**: SHA-256(static_root || dynamic_data) -- an unkeyed application-layer integrity check computed over the concatenation of the static root hash and the compressed dynamic data bytes. This check detects accidental corruption or protocol-layer ordering errors prior to the transport authentication layer. Cryptographic authenticity against active adversaries is provided by the transport layer (e.g., AEAD encryption of the full packet).

**"Semantic Compression"**: The practice of representing a context block by its content hash and semantic summary rather than its raw text, reducing payload volume while retaining verifiability (via content hash comparison when raw text is available) and usable context (via the semantic summary as operative representation of the turn's content).

**"Bandwidth-Constrained Channel"**: Any communication channel with limited throughput, including but not limited to steganographic channels (as disclosed in SALUCA-012), low-bandwidth wireless links, satellite links, air-gapped systems where data crosses a network gap via indirect means, DNS covert channels, and surveillance-sensitive environments where large data volumes increase detection risk.

### 7.2 System Architecture Overview

Referring now to FIG. 1, the system of the present invention comprises a first computing node (100) and a second computing node (200) connected by a bandwidth-constrained communication channel (300). Each node maintains a local instance of the context synchronization protocol and communicates via SYNC and ACK packets.

The first computing node (100) comprises:

- A context chain manager (110) configured to maintain the static root hash and the dynamic window;
- A sync packet generator (120) configured to serialize, compress, and package the dynamic window into a SYNC packet with the current static root hash;
- A transmission module (130) configured to transmit packets over the bandwidth-constrained channel (300);
- An acknowledgment processor (140) configured to receive and validate ACK packets and advance the local static root upon successful acknowledgment.

The second computing node (200) comprises corresponding components:

- A context chain manager (210) maintaining its own static root hash and dynamic window;
- A sync packet validator (220) configured to receive, decompress, and validate incoming SYNC packets;
- A root advancement module (230) configured to fold received dynamic blocks into the static root;
- An ACK generator (240) configured to construct and transmit ACK packets carrying the updated root.

In operation, when new conversation turns occur at the first computing node (100), the context chain manager (110) constructs context blocks and appends them to the dynamic window. When synchronization is triggered, the sync packet generator (120) serializes and compresses the dynamic window, constructs a SYNC packet including the current static root hash, and the transmission module (130) transmits the packet over the channel (300). The second computing node (200) receives the SYNC packet via the sync packet validator (220), verifies integrity and consistency, ingests the dynamic blocks, advances its static root via the root advancement module (230), and transmits an ACK packet via the ACK generator (240). Upon receiving the ACK, the first node's acknowledgment processor (140) verifies the acknowledged root, promotes the dynamic window into the static root, and clears the dynamic window.

### 7.3 Context Chain Architecture

Referring now to FIG. 2, the context chain maintained on each computing node comprises two components:

**7.3.1 Static Root Hash (32 bytes).** A rolling SHA-256 commitment to all previously acknowledged context blocks. Initialized to SHA-256("hctp-genesis-v1") at session establishment. Advanced only upon successful acknowledgment exchange. The static root hash is the sole on-wire representation of the acknowledged history: a conversation of any depth -- ten turns or ten thousand turns -- produces the same 32-byte static root.

**7.3.2 Dynamic Window.** An ordered list of context blocks added since the last acknowledgment. Empty after each successful ACK exchange. The dynamic window is the variable-size payload of each SYNC packet.

**7.3.3 Block Construction.** When a new conversation turn occurs, a context block is constructed with the following fields:

- `seq`: The next available sequence number, a monotonically increasing unsigned 32-bit integer. Sequence numbers are never reused within a session.
- `role`: The turn originator identifier ("user", "agent", or application-defined). The role field enables the receiving node to reconstruct the conversational structure.
- `content_hash`: SHA-256(raw_text.encode("utf-8")). The content hash provides a cryptographic binding to the original turn text, enabling deferred verification by any party that possesses or later obtains the raw text.
- `summary`: A human-generated or model-generated semantic distillation of the turn's content, not exceeding 120 characters in the preferred embodiment. The summary serves as the operative representation of the turn's content for parties that do not possess the raw text.

The constructed block is appended to the dynamic window. It is NOT incorporated into the static root at construction time -- it remains pending until acknowledged by the remote party.

**7.3.4 Rolling Root Advancement.** Upon acknowledgment of a SYNC packet (see Section 7.5), the receiver (and subsequently the sender upon receiving ACK) folds each dynamic block into the static root in sequence order:

```
FUNCTION advance_root(static_root, dynamic_window):
    FOR EACH block B IN dynamic_window (in seq order):
        block_hash = SHA-256(canonical_serialize(B))
        static_root = SHA-256(static_root || block_hash)
    CLEAR dynamic_window
    RETURN static_root
```

where `canonical_serialize(B)` produces a deterministic byte representation of the block (sorted-key JSON with no whitespace). This operation is O(n) in the number of newly acknowledged blocks and O(1) in the total history depth -- folding 5 new blocks into a root representing 10,000 prior blocks requires exactly 5 hash computations, identical to folding 5 new blocks into a root representing 10 prior blocks.

### 7.4 Wire Format

**7.4.1 SYNC Packet (FIG. 3)**

Referring now to FIG. 3, the SYNC packet wire format is defined as follows (all multi-byte integers are big-endian):

```
Offset  Length  Field
------  ------  ----------------------------------------------------------
0       1       version        = 0x01
1       1       packet_type    = 0x53 ('S')
2       4       seq            uint32 -- sender's current sequence number
6       32      static_root    SHA-256 rolling root of acknowledged history
38      4       dynamic_len    uint32 -- length of dynamic_data in bytes
42      N       dynamic_data   zlib-compressed JSON array of context blocks
42+N    32      combined_hash  SHA-256(static_root || dynamic_data)
------  ------  ----------------------------------------------------------
Total: 74 + N bytes (N = compressed dynamic payload size)
```

The fixed overhead of 74 bytes (version + type + seq + static_root + dynamic_len + combined_hash) is constant regardless of conversation history depth. The variable portion N depends only on the number and size of pending context blocks, not on the acknowledged history.

The `combined_hash` field covers the concatenation of `static_root` and `dynamic_data` bytes (not `dynamic_len`). Transport-layer authentication (e.g., AEAD encryption) covers the full packet including `dynamic_len`.

**7.4.2 ACK Packet (FIG. 4)**

Referring now to FIG. 4, the ACK packet wire format is defined as follows:

```
Offset  Length  Field
------  ------  ----------------------------------------------------------
0       1       version        = 0x01
1       1       packet_type    = 0x41 ('A')
2       4       seq            uint32 -- echoed from acknowledged SYNC
6       32      new_root       SHA-256 rolling root after folding dynamic
------  ------  ----------------------------------------------------------
Total: 38 bytes (constant)
```

The ACK packet is always exactly 38 bytes, making acknowledgment transmission low-cost even on extremely constrained channels. At 38 bytes, the ACK fits within a minimal steganographic channel file of approximately 50 positions (at 6 bits per position average entropy).

**7.4.3 Dynamic Payload Encoding**

The `dynamic_data` field contains a zlib-compressed (RFC 1950, compression level 9) JSON array. Each element is a JSON object with keys: "content_hash", "role", "seq", "summary". Keys are sorted alphabetically; no whitespace is included. Example:

```json
[{"content_hash":"a3f9...","role":"user","seq":0,
  "summary":"asked about mission status"},
 {"content_hash":"b82c...","role":"agent","seq":1,
  "summary":"confirmed nominal status"}]
```

The combination of sorted-key JSON serialization and zlib compression exploits the repetitive JSON structure across multiple blocks, achieving further compression beyond the semantic compression of individual blocks.

### 7.5 State Machine and Protocol Operation

Referring now to FIG. 5, the protocol state machine defines the complete synchronization cycle.

**7.5.1 Sender: Building and Transmitting a SYNC Packet**

```
FUNCTION send_sync(context_chain_manager):
    (a) Verify dynamic window is non-empty; if empty, no synchronization needed.
    (b) Serialize dynamic window to sorted-key JSON array.
    (c) Compress JSON bytes with zlib level 9 to produce dynamic_data.
    (d) Compute combined_hash = SHA-256(static_root || dynamic_data).
    (e) Construct SYNC packet:
        - version = 0x01
        - packet_type = 0x53
        - seq = current sequence number (highest seq in dynamic window)
        - static_root = current static root hash
        - dynamic_len = length(dynamic_data)
        - dynamic_data = compressed bytes
        - combined_hash = computed hash
    (f) Transmit SYNC packet over the bandwidth-constrained channel.
    (g) Await ACK. Retain dynamic window contents until ACK received.
```

**7.5.2 Receiver: Validating and Ingesting a SYNC Packet**

```
FUNCTION receive_sync(sync_packet, local_state):
    (a) Replay rejection: if sync_packet.seq <= last_acked_seq,
        silently discard. This prevents replay of previously
        processed synchronization packets.

    (b) Duplicate detection: if sync_packet.seq == last_seen_seq AND
        sync_packet.static_root matches local static root,
        retransmit cached prior ACK without re-folding
        (idempotent retransmit path for lossy channels).

    (c) Verify combined_hash: recompute
        SHA-256(sync_packet.static_root || sync_packet.dynamic_data);
        reject packet if recomputed hash does not match
        sync_packet.combined_hash.

    (d) Verify static_root: compare sync_packet.static_root to local
        static root hash; reject if mismatch (indicates history
        divergence, wrong session, or tampering).

    (e) Decompress dynamic_data using zlib; deserialize JSON array;
        validate that each block contains required fields
        (seq, role, content_hash, summary) and that sequence numbers
        are contiguous and ascending.

    (f) Append decoded context blocks to local context chain.

    (g) Fold dynamic window into static root using advance_root()
        (Section 7.3.4), producing new_root.

    (h) Clear dynamic window. Record last_seen_seq = sync_packet.seq.

    (i) Construct ACK packet:
        - version = 0x01
        - packet_type = 0x41
        - seq = sync_packet.seq (echo)
        - new_root = computed new root after folding
    (j) Transmit ACK packet.
```

**7.5.3 Sender: Processing ACK**

```
FUNCTION process_ack(ack_packet, local_state):
    (a) Compute expected_root by locally folding pending dynamic
        blocks against current static root using advance_root().

    (b) Compare ack_packet.new_root to expected_root.

    (c) If match: promote dynamic window to static section
        (update static root to new_root, clear dynamic window).
        Record last_acked_seq = ack_packet.seq. Synchronization
        cycle complete.

    (d) If mismatch: signal error -- history has diverged.
        Recovery requires session re-establishment with fresh
        genesis constant.
```

**7.5.4 Replay and Duplicate Protection**

The receiver maintains `last_acked_seq` initialized to -1 (sentinel value indicating no prior acknowledgment). Any SYNC packet with `seq <= last_acked_seq` is rejected, preventing replay of previously processed packets. Sequence numbers are unsigned 32-bit integers; at wraparound (overflow from 0xFFFFFFFF to 0x00000000), both parties MUST initiate a new session with a fresh genesis constant to prevent replay window violation. The 32-bit sequence space supports over 4.29 billion synchronization exchanges before wraparound, which is sufficient for practical deployment scenarios.

### 7.6 Semantic Compression

Referring now to FIG. 7, the semantic compression subsystem reduces the wire cost of each context block relative to raw text transmission.

**7.6.1 Content Hash Binding**

Each context block carries `content_hash = SHA-256(raw_text.encode("utf-8"))`, providing a cryptographic binding to the original turn text. This binding serves two purposes:

1. **Deferred Verification**: A receiver that possesses or later obtains the original raw text may recompute the SHA-256 hash and compare it to the stored `content_hash` to verify that the semantic summary corresponds to the claimed original text.

2. **Content Identity**: The content hash uniquely identifies the raw text content (with negligible collision probability under SHA-256) without requiring the raw text to be present, enabling content-addressable retrieval from external storage systems.

If the receiver does not possess the original text, it accepts the summary as the operative representation of the turn's content, with the content hash serving as a future verification anchor.

**7.6.2 Compression Ratio Analysis**

In the preferred embodiment, a 500-word conversation turn (approximately 3,000 bytes of UTF-8 text) is represented as a context block of approximately 100-140 bytes:

- Content hash: 64 hexadecimal characters (representing 32 bytes of SHA-256 digest)
- Semantic summary: at most 120 characters
- JSON structure overhead: approximately 30-50 bytes (keys, delimiters, sequence number, role)

This achieves compression ratios of 20:1 to 30:1 relative to raw text transmission for individual blocks. After zlib compression of the JSON array containing multiple blocks, the repeated JSON structure keywords compress further, improving the effective ratio for multi-block payloads.

**7.6.3 Semantic Fidelity vs. Cryptographic Fidelity**

The protocol explicitly distinguishes between semantic fidelity and cryptographic fidelity. The protocol guarantees cryptographic fidelity: that the block sequence has not been modified since construction (via the hash chain) and that the content hash correctly identifies the original text (via SHA-256 binding). The protocol does NOT guarantee semantic fidelity: that the semantic summary faithfully captures the meaning of the original turn. Semantic fidelity is an application-layer concern, delegated to the summary generation mechanism (human, LLM, or deterministic summarizer per Section 7.8.6).

### 7.7 Integration with Steganographic Channels

Referring now to FIG. 8, in the preferred embodiment the HCTP protocol integrates with the steganographic encoding layer disclosed in SALUCA-012.

**7.7.1 Payload Delivery**

The fully serialized HCTP SYNC packet (binary bytes per Section 7.4.1) is provided as the plaintext payload to the steganographic encoding layer. The steganographic encoder encodes this payload into cover text using arithmetic coding over a frozen LLM token probability distribution. The combined system achieves covert transmission of conversational context: an observer monitoring the communication channel perceives only natural-language text; no context transfer is perceptible.

**7.7.2 Capacity Planning**

A SYNC packet carrying N dynamic blocks requires approximately 74 + C(N) bytes, where C(N) is the zlib-compressed size of N blocks (empirically approximately 80-140 bytes per block after compression). The steganographic channel disclosed in SALUCA-012 provides capacity of approximately C_stego bits per channel file. System designers should ensure C_stego >= (74 + C(N)) x 8 bits for the expected delta size N. For a typical synchronization of 5 new turns, the SYNC packet is approximately 74 + 500 = 574 bytes (4,592 bits), well within the capacity of a single steganographic channel file of moderate length.

**7.7.3 ACK Channel**

The ACK packet (38 bytes constant) may be transmitted over the same or a separate steganographic channel. At 38 bytes (304 bits), the ACK fits within a minimal channel file of approximately 50 positions (at 6 bits per position average entropy), making ACK transmission low-cost.

**7.7.4 Transport Security**

When transmitted via the SALUCA-012 steganographic layer, ChaCha20-Poly1305 AEAD encryption is applied to the full HCTP packet (both SYNC and ACK) prior to steganographic encoding. This provides:

- **Confidentiality**: The packet content, including the static root hash, dynamic blocks, and sequence numbers, is encrypted and not readable by any party without the shared key.
- **Authenticated Integrity**: The Poly1305 authentication tag covers all header fields and payload bytes, detecting any modification during transport.
- **Replay Protection at Transport Layer**: Combined with the protocol-layer sequence number checking, this provides defense-in-depth against replay attacks.

### 7.8 Alternative Embodiments

**7.8.1 Non-Steganographic Transports.** The HCTP protocol is transport-agnostic. In alternative embodiments, SYNC and ACK packets may be transmitted over any channel, including but not limited to: encrypted messaging protocols (Signal, WhatsApp, Matrix), email attachments (MIME-encoded), DNS TXT records (for covert channels), social media posts (as encoded payloads), HTTP long-polling connections, WebSocket streams, MQTT topics (for IoT agent coordination), or conventional TCP/IP connections. The protocol's value -- O(1) acknowledged history wire cost -- applies to all bandwidth-constrained scenarios regardless of the underlying transport.

**7.8.2 Merkle Tree Extension.** In an alternative embodiment, the rolling root is replaced or augmented by a Merkle tree over context blocks, enabling inclusion proofs ("prove that turn N is part of the acknowledged history") without transmitting the full chain. The ACK mechanism is extended to carry a Merkle proof alongside the new root. This embodiment trades O(log N) proof size for the ability to selectively verify individual blocks without full chain traversal.

**7.8.3 Multi-Party Context Chains.** In an alternative embodiment supporting more than two parties (e.g., a multi-agent conversation with three or more AI agents), each party maintains its own static root reflecting the turns it has acknowledged. A coordinator node maintains a global root that folds in roots from all parties. SYNC packets include a party identifier in the block structure, and the fold operation is extended to include the party identifier in the hash input, preventing cross-party root collisions.

**7.8.4 LLM-Generated Summaries.** In an alternative embodiment, the semantic summary in each context block is generated automatically by an LLM summarization model rather than provided by the application. This enables fully automated semantic compression without human intervention, suitable for high-throughput agent-to-agent communication where manual summarization is impractical.

**7.8.5 Variable-Length Rolling Window.** In an alternative embodiment, the static/dynamic partition is not defined by acknowledgment boundaries but by a configurable sliding window size W. Blocks older than W turns are automatically promoted to the static root regardless of explicit acknowledgment, providing bounded dynamic window size at the cost of requiring both parties to agree on W. This embodiment is suitable for unreliable channels where ACK packets may be lost.

**7.8.6 Deterministic Summarization Protocol (Verifiable Gist).** In a preferred alternative embodiment, the semantic summary in each context block is not provided by the application but is computed deterministically from the raw turn text using a fixed, pre-agreed summarization function:

```
summary = Summarize(model, prompt_template, raw_text)
```

where `model` is a specified large language model (identified by name, version, and quantization level), and `prompt_template` is a fixed instruction string agreed upon out-of-band by both parties (e.g., "Summarize the following in 15 words or fewer: {text}").

Because both the model and prompt template are fixed and deterministic, any party in possession of the raw text can recompute the summary independently and arrive at the identical string. Combined with the content_hash binding (which cryptographically commits to the raw text), this yields a fully verifiable context block:

- The `content_hash` proves the raw text identity (any party with the raw text can verify the hash).
- The `summary` can be recomputed from the raw text by any authorized party using the agreed model and prompt.

Critically, a receiver that does not possess the raw text can still use the summary as operative context -- the "gist" -- while knowing that any party who later obtains the raw text can verify both the hash and the summary exactly. The summary is not merely trusted; it is independently reproducible and therefore auditable.

This embodiment introduces a dependency on the availability and consistency of the summarization model. In the preferred implementation, the summarization model is the same frozen LLM distribution used for steganographic channel encoding (as disclosed in SALUCA-012), eliminating any additional infrastructure requirement: a single pre-shared channel file serves both the steganographic transport function and the deterministic context summarization function.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented system for incremental context transfer between a first computing node and a second computing node over a bandwidth-constrained communication channel, the system comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to:

(a) maintain, at the first computing node, a context chain comprising (i) a static root hash comprising a fixed-size cryptographic commitment to an ordered sequence of acknowledged context blocks, the static root hash having a size independent of the number of acknowledged context blocks it represents, and (ii) a dynamic window comprising an ordered set of pending context blocks not yet acknowledged by the second computing node;

(b) construct each context block to comprise a sequence number identifying the block's position, a role indicator identifying the turn originator, a content hash comprising a cryptographic digest of raw turn text, and a semantic summary comprising a natural-language distillation of the turn's content;

(c) generate a sync packet comprising the static root hash and a compressed serialization of the dynamic window, wherein the sync packet's fixed overhead is constant regardless of the number of acknowledged context blocks represented by the static root hash;

(d) compute a combined hash over the concatenation of the static root hash and the compressed dynamic window data, and include the combined hash in the sync packet for application-layer integrity verification;

(e) transmit the sync packet over the bandwidth-constrained communication channel;

(f) receive an acknowledgment packet from the second computing node, the acknowledgment packet comprising an updated static root hash computed by the second computing node after folding the dynamic window blocks into its local static root; and

(g) upon verifying that the updated static root hash in the acknowledgment packet matches a locally computed expected root, advance the static root hash by cryptographically folding each block in the dynamic window into the static root hash and clearing the dynamic window.

**Claim 2.** A computer-implemented method for incremental conversational context transfer, comprising:

(a) maintaining, at a first node, a context chain comprising a static root hash representing a cryptographic commitment to an acknowledged conversation history and a dynamic window of pending context blocks, wherein the static root hash is computed as a sequential fold: for each acknowledged block B_n, root_n = H(root_{n-1} || H(serialize(B_n))), where H is a cryptographic hash function and serialize produces a canonical deterministic byte representation, and root_0 is a fixed genesis constant;

(b) constructing each pending context block to comprise a sequence number, a role indicator, a content hash computed as a cryptographic digest of raw turn text, and a semantic summary of the turn's content having a length substantially less than the raw turn text;

(c) generating a sync packet comprising the static root hash, a compressed representation of the dynamic window, a sequence number, and a combined hash computed over the static root hash concatenated with the compressed dynamic window data;

(d) transmitting the sync packet over a bandwidth-constrained communication channel;

(e) receiving, at a second node, the sync packet;

(f) rejecting, at the second node, the sync packet if the sync packet's sequence number is less than or equal to a last-acknowledged sequence number maintained by the second node;

(g) verifying, at the second node, that the combined hash in the sync packet matches a recomputed hash of the static root hash concatenated with the compressed dynamic window data;

(h) verifying, at the second node, that the static root hash in the sync packet matches the second node's local static root hash, thereby confirming that both nodes agree on the acknowledged conversation history;

(i) decompressing and ingesting the dynamic window contents at the second node;

(j) advancing the static root hash at the second node by sequentially folding each ingested block into the static root hash using the fold operation;

(k) transmitting an acknowledgment packet from the second node to the first node, the acknowledgment packet comprising the advanced static root hash and the echoed sequence number; and

(l) advancing the static root hash at the first node to match the acknowledged root hash and clearing the dynamic window.

### Dependent Claims

**Claim 3.** The system of Claim 1, wherein the cryptographic hash function used for the static root hash, the content hash, and the combined hash is SHA-256, and wherein the static root hash is initialized to SHA-256 of a fixed genesis constant string that identifies the protocol version.

**Claim 4.** The system of Claim 1, wherein the compressed serialization of the dynamic window comprises a zlib-compressed JSON array in which each element is a JSON object with alphabetically sorted keys and no whitespace, and wherein the wire size of the sync packet is bounded by a fixed overhead of 74 bytes plus the compressed size of only the pending blocks, independent of the total number of acknowledged blocks.

**Claim 5.** The system of Claim 1, wherein the semantic summary in each context block does not exceed 120 characters, and wherein each context block achieves a compression ratio of at least 20:1 relative to the raw turn text for turns of 500 words or more.

**Claim 6.** The system of Claim 1, wherein the bandwidth-constrained communication channel is a steganographic channel that encodes the sync packet within natural-language text generated using arithmetic coding over frozen large language model token probability distributions.

**Claim 7.** The system of Claim 6, wherein the sync packet is encrypted using ChaCha20-Poly1305 authenticated encryption with associated data (AEAD) prior to steganographic encoding, providing confidentiality and authenticated integrity of all packet fields.

**Claim 8.** The method of Claim 2, further comprising:

maintaining, at the second node, a last-seen sequence number; and

upon receiving a sync packet whose sequence number equals the last-seen sequence number and whose static root hash matches the local static root hash, retransmitting a cached prior acknowledgment packet without re-folding the dynamic window, thereby providing idempotent retransmission for lossy channels.

**Claim 9.** The method of Claim 2, wherein the sync packet wire format comprises:

a one-byte version field;
a one-byte packet type field having value 0x53;
a four-byte big-endian unsigned integer sequence number;
a 32-byte static root hash;
a four-byte big-endian unsigned integer dynamic data length;
a variable-length compressed dynamic data payload; and
a 32-byte combined hash;

and wherein the acknowledgment packet wire format comprises:

a one-byte version field;
a one-byte packet type field having value 0x41;
a four-byte big-endian unsigned integer sequence number echoed from the sync packet; and
a 32-byte new root hash;

totaling a constant 38 bytes for the acknowledgment packet.

**Claim 10.** The method of Claim 2, wherein upon the sequence number reaching the maximum value of an unsigned 32-bit integer, both nodes initiate a new session with a fresh genesis constant to prevent replay window violation.

**Claim 11.** The method of Claim 2, wherein the semantic summary of each context block is computed deterministically by applying a fixed summarization function to the raw turn text, the fixed summarization function comprising a pre-agreed large language model identified by name, version, and quantization level, and a pre-agreed prompt template, such that any party in possession of the raw turn text can independently recompute the identical semantic summary, thereby making the semantic summary independently verifiable rather than merely trusted.

**Claim 12.** The method of Claim 11, wherein a receiver without access to the raw turn text uses the semantic summary as operative context while retaining the ability to verify summary correctness upon later obtaining the raw text by: (a) recomputing the content hash from the raw text and comparing it to the stored content hash, and (b) recomputing the semantic summary using the pre-agreed model and prompt template and comparing it to the stored summary.

**Claim 13.** The method of Claim 11, wherein the pre-agreed large language model used for deterministic summarization is the same frozen token probability distribution used by the steganographic encoding channel, such that a single pre-shared channel artifact serves both the transport encoding function and the deterministic context summarization function.

**Claim 14.** The system of Claim 1, wherein the system further supports more than two communicating parties, each party maintaining its own static root hash reflecting turns it has acknowledged, and a coordinator node maintaining a global root that folds in roots from all parties, wherein sync packets include a party identifier in the block structure.

**Claim 15.** The system of Claim 1, wherein the dynamic window is bounded by a configurable sliding window size W, and blocks older than W turns are automatically promoted to the static root regardless of explicit acknowledgment.

**Claim 16.** A non-transitory computer-readable medium storing instructions that, when executed by one or more processors, implement a context synchronization protocol comprising:

(a) partitioning a conversation history into a static section represented by a rolling hash commitment of fixed size and a dynamic section comprising pending unacknowledged turns, wherein the rolling hash commitment is computed as a sequential cryptographic fold of all acknowledged turn hashes against a genesis constant;

(b) constructing each turn representation as a context block comprising a monotonically increasing sequence number, a role indicator, a cryptographic digest of the raw turn text, and a semantic summary of the turn content;

(c) transmitting over a communication channel only the dynamic section and the fixed-size rolling hash commitment, wherein the transmission size grows with the number of pending turns but not with the depth of the acknowledged history;

(d) verifying, at a receiving node, application-layer integrity of the received packet by recomputing a combined hash over the rolling hash commitment and the compressed dynamic section data;

(e) verifying, at the receiving node, history consistency by comparing the received rolling hash commitment to the receiving node's local rolling hash commitment;

(f) upon successful verification, cryptographically folding each pending turn into the rolling hash commitment and clearing the dynamic section;

(g) transmitting an acknowledgment comprising the updated rolling hash commitment; and

(h) rejecting any retransmission of a previously acknowledged dynamic section based on a monotonically advancing sequence identifier.

**Claim 17.** A computer-implemented system for constant-overhead conversational context synchronization, the system comprising:

a context chain manager configured to partition conversation history between a static section represented by a 32-byte SHA-256 rolling root hash and a dynamic section of pending context blocks, and to advance the rolling root hash by computing root_n = SHA-256(root_{n-1} || SHA-256(canonical_serialize(B_n))) for each acknowledged block B_n;

a semantic compression module configured to represent each context block as a content hash and a semantic summary rather than raw turn text, achieving a compression ratio of at least 20:1;

a sync packet generator configured to produce sync packets comprising the 32-byte rolling root hash and a zlib-compressed serialization of only the pending context blocks;

an acknowledgment processor configured to verify acknowledged root hashes and promote dynamic blocks to the static section; and

a replay protection module configured to reject sync packets with sequence numbers not exceeding a last-acknowledged sequence number and to detect history divergence via rolling root hash comparison.

**Claim 18.** The system of Claim 17, further comprising a transport integration module configured to deliver sync packets and acknowledgment packets as plaintext payloads to a steganographic encoding layer that encodes the payloads within AI-generated natural-language text.

**Claim 19.** The system of Claim 17, wherein the sync packet has a fixed overhead of 74 bytes independent of conversation history depth, and the acknowledgment packet has a constant size of 38 bytes.

**Claim 20.** The system of Claim 17, further comprising a deterministic summarization module configured to generate semantic summaries using a pre-agreed frozen large language model and prompt template, such that summaries are independently reproducible and auditable by any party possessing the raw turn text, yielding verifiable context blocks whose content hash and semantic summary can both be independently verified.

---

## 9. ABSTRACT

A method and system for incremental conversational context transfer between computing nodes over bandwidth-constrained communication channels. Conversation history is partitioned into a static section -- represented by a rolling SHA-256 hash commitment ("static root") of constant 32-byte wire size regardless of history depth -- and a dynamic section comprising only unacknowledged pending turns. On each synchronization exchange, only the dynamic section plus the 32-byte static root cross the communication channel, achieving O(1) wire cost for the acknowledged history portion. An acknowledgment mechanism drives root advancement: upon receipt and confirmation of the dynamic section, both nodes fold the acknowledged turns into the static root and clear the dynamic window. The protocol enforces replay resistance via monotonic sequence tracking with defined wraparound behavior and detects history divergence via static root comparison. Each context block carries a cryptographic hash of raw turn text plus a short semantic summary, enabling semantic compression ratios of 20:1 or greater. In an alternative embodiment, the semantic summary is computed deterministically from the raw text using a pre-agreed large language model and prompt template, making the summary independently reproducible and auditable by any party possessing the raw text -- a "verifiable gist." In a preferred embodiment, the protocol payload is transmitted via a steganographic channel that encodes the payload within AI-generated natural-language text using arithmetic coding over frozen token probability distributions, enabling covert context synchronization indistinguishable to passive observers from ordinary text content.

---

## APPENDIX A: AI DISCLOSURE STATEMENT

Portions of the implementation described herein (specifically, Python code implementing the protocol state machine, wire format serialization, and demonstration test harness) were developed with assistance from Claude (Anthropic, Inc.), an AI language model. Such assistance was limited to implementation scaffolding. All inventive conception, including the static/dynamic partition architecture, rolling root hash construction, semantic compression approach with content-hash binding, replay protection scheme, deterministic summarization ("verifiable gist") concept, and integration with steganographic channels, originated exclusively with the named inventor, Cristian Xavier Ruvalcaba, and is the sole intellectual property of the inventor and Saluca LLC.

This disclosure is made in compliance with USPTO guidance on AI-assisted inventions (February 2024 Inventorship Guidance) and the Federal Circuit's decision in Thaler v. Vidal (Fed. Cir. 2022), affirming that AI systems cannot be listed as inventors on patent applications.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-013
