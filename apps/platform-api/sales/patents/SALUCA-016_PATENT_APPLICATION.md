# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-016
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**System and Method for Distributed Multi-Agent Knowledge Graph Architecture with Per-Agent Interest Tables and Role-Bound Confidence Threshold Modulation**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to U.S. Provisional Patent Application Serial No. [SALUCA-015], entitled "System and Method for Three-Tier Hierarchical Memory Architecture for Autonomous AI Agents," filed previously herewith, the disclosure of which is incorporated herein by reference in its entirety. The present application extends the single-agent hierarchical memory architecture disclosed in SALUCA-015 to a multi-agent context, introducing per-agent interest tables as confidence threshold modulators for individuated retrieval from a shared knowledge graph substrate.

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of multi-agent artificial intelligence systems and, more particularly, to systems and methods for enabling a plurality of autonomous AI agents to share a single confidence-gated knowledge graph while retrieving individuated subsets of that graph at inference time based on per-agent interest tables comprising topic-to-weight mappings that modulate each agent's effective confidence injection threshold. The invention encompasses per-agent interest table data structures for retrieval specialization, human-confirmed anchor nodes for enterprise policy enforcement, per-agent local memory chains with two-stage commit proposal mechanisms, and role-bound namespace partitioning via database-level Row Level Security (RLS) for multi-agent write isolation.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

Modern enterprise AI deployments increasingly require multiple specialized autonomous agents operating concurrently within a single organizational context. A security-focused agent, an infrastructure monitoring agent, a customer-facing conversational agent, and a data analytics agent may all need access to the same underlying organizational knowledge -- including facts about the enterprise's systems, personnel, policies, products, and operating environment. The challenge of enabling these diverse agents to share knowledge efficiently while maintaining role-appropriate specialization, access control, and unified policy enforcement represents a significant unsolved problem in the field of multi-agent AI systems.

The naive approach of providing each agent with a complete copy of the organizational knowledge base creates severe problems of duplication, consistency drift, and storage cost. When one agent updates a fact, all copies held by other agents become stale. The number of synchronization operations required scales as O(n^2) with the number of agents, creating an unmanageable maintenance burden as the agent population grows.

An alternative approach -- providing all agents with a single shared flat context -- eliminates the duplication problem but introduces a different class of failures. A flat shared context contains no mechanism for specialization: the security agent receives the same context window as the customer-facing agent, including information that may be irrelevant, distracting, or inappropriate for the latter's role. More critically, flat context sharing creates privacy and need-to-know violations. An agent serving external customers should not have access to internal threat intelligence; an infrastructure agent should not routinely surface sensitive personnel data. Flat shared context provides no principled mechanism for enforcing such access differentiation at the knowledge retrieval layer.

Retrieval-Augmented Generation (RAG) architectures address some of these limitations by decoupling the knowledge store from the inference-time context. However, existing RAG systems are typically designed for single-agent retrieval paths. Extending RAG to multi-agent settings requires either separate vector stores per agent (reintroducing duplication) or a shared store with no mechanism for per-agent retrieval differentiation.

### 4.2 Limitations of Existing Solutions

Several existing systems attempt to address aspects of this problem, but each suffers from significant limitations:

**MemGPT** (Packer et al., "MemGPT: Towards LLMs as Operating Systems," 2023) discloses a single-agent memory management system that uses a hierarchical memory architecture comprising in-context memory, external memory, and archival memory, with autonomous memory operations that allow the agent to manage its own context window. However, MemGPT is a single-agent architecture with no provision for multi-agent shared memory. It provides no mechanism for multiple agents to share a common knowledge substrate, no interest table concept for per-agent retrieval modulation, and no confidence-gated shared graph with per-agent threshold adjustment. The present invention is distinguished from MemGPT by the multi-agent shared graph substrate, the per-agent interest table mechanism for confidence threshold modulation, and the anchor node enforcement mechanism for enterprise policy propagation.

**GraphRAG** (Edge et al., Microsoft Research, "From Local to Global: A Graph RAG Approach to Query-Focused Summarization," 2024) discloses a retrieval-augmented generation system that constructs a knowledge graph from a document corpus using LLM-generated entity and relationship extractions, then uses community-level summaries organized in a hierarchical structure for retrieval. GraphRAG is a single-retrieval-path system designed for a single agent querying a statically constructed graph. GraphRAG provides no mechanism for per-agent weight modulation, no interest table concept, no confidence scoring of individual nodes with per-agent threshold adjustment, no anchor node enforcement for policy propagation, and no multi-agent write partitioning. The present invention differs from GraphRAG in providing a dynamically updated shared graph with per-agent retrieval specialization via interest tables and enterprise policy enforcement via anchor nodes.

**LangChain** multi-agent frameworks (LangChain Inc., 2022-present) provide orchestration for multiple LLM agents communicating via message passing. LangChain agents do not share a persistent confidence-gated knowledge graph; their communication is mediated through ephemeral message chains and tool invocations rather than structured graph memory. LangChain provides no interest table mechanism, no confidence threshold modulation per agent, and no anchor node enforcement. The present invention is distinguished by the persistent shared graph with per-agent threshold modulation that shapes each agent's perceptual aperture without modifying the shared graph itself.

**AutoGen** (Wu et al., Microsoft Research, "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation," 2023) discloses a multi-agent conversation framework in which agents with defined roles exchange messages to accomplish tasks through multi-turn conversations. AutoGen supports role-based agents but does not provide a persistent shared knowledge graph, confidence-scored nodes, interest tables, or anchor node enforcement. Agents in AutoGen communicate through conversational turns; they do not share a structured memory substrate with per-agent retrieval specialization. The present invention is distinguished from AutoGen by the persistent graph substrate, the interest table mechanism as a confidence threshold modulator, and the two-stage commit architecture for knowledge proposal.

**CrewAI** (CrewAI Inc., 2023-present) discloses a multi-agent framework with role-based agents and shared memory constructs. CrewAI's shared memory is a flat, unscored store without confidence thresholds, node type categorization, interest weight modulation, or anchor node enforcement. CrewAI agents share memory through a simple key-value interface that does not support per-agent retrieval differentiation based on role-specific interest profiles. The present invention is distinguished from CrewAI by the confidence-gated shared graph architecture and the per-agent interest table as a retrieval threshold modulator that creates individuated perceptual apertures from a unified knowledge substrate.

**Azure Digital Twins** (Microsoft Corporation) is a platform for modeling and monitoring IoT device networks as a graph of interconnected digital twins using the Digital Twins Definition Language (DTDL). Azure Digital Twins is concerned with physical device state representation in an IoT context, not with LLM agent memory management. It has no concept of confidence-scored knowledge nodes, interest tables for agent retrieval modulation, inference-time graph traversal for agent context injection, or anchor node enforcement for enterprise policy. The present invention is entirely distinguished from Azure Digital Twins by both domain and mechanism.

**AGENTiGraph** (Zhao et al., ACM, 2024-2025) discloses a multi-agent knowledge graph framework for interactive domain-specific data management using a shared Neo4j graph database. AGENTiGraph employs multiple agents for intent classification, task planning, knowledge extraction, and graph visualization, with all agents accessing a single shared graph via Cypher queries. However, AGENTiGraph provides no per-agent retrieval weights or interest tables, no confidence scoring on knowledge nodes, no immutable policy nodes, and no namespace partitioning via database-level security. All agents in AGENTiGraph access the graph uniformly without retrieval differentiation. The present invention is distinguished from AGENTiGraph by the per-agent interest table mechanism that modulates effective confidence thresholds per node category, the anchor node enforcement mechanism, and the RLS-enforced namespace partitioning for write isolation.

**Mem0** (Mem0 AI, 2024-present) provides a memory layer for AI applications that stores and retrieves memories using vector embeddings and graph structures. Mem0 is designed as a single-agent or single-user memory system that does not provide multi-agent shared memory with per-agent retrieval differentiation, does not implement confidence scoring with per-agent threshold modulation, does not support anchor nodes or enterprise policy enforcement, and does not implement namespace partitioning via database-level security policies. The present invention is distinguished from Mem0 by the multi-agent architecture with interest-table-modulated retrieval from a shared confidence-gated graph.

**Recommendation and personalization systems** (including collaborative filtering systems employed by Netflix, Spotify, and similar platforms) model per-user preferences as weighted vectors used to predict content preferences. Such systems are distinguished from the present invention in both purpose and mechanism. The interest table in the present invention does not predict user preference; it modulates the agent's confidence retrieval threshold during knowledge graph traversal. The agent does not "prefer" certain topics in the sense of expecting to find them useful; rather, the agent's effective sensitivity to evidence of different types is adjusted to match its functional role requirements. Collaborative filtering operates on interaction history to predict future preferences; the present invention's interest table operates on role definitions to adjust epistemological sensitivity thresholds. These are fundamentally different mechanisms serving fundamentally different purposes.

**US Patent No. 12,061,970** (Broadridge Financial Solutions Inc., 2025) covers LLM orchestration of machine learning agents using user profile attributes for data retrieval and security, with multi-agent adversarial features for accuracy and explainability. This patent uses personalization for agent coordination but does not disclose a shared confidence-gated knowledge graph, per-agent interest tables for threshold modulation, anchor nodes for policy enforcement, or role-bound namespace partitioning via RLS. The present invention is distinguished by the interest table mechanism that operates on a shared graph substrate rather than on per-user profile attributes, and by the anchor node enforcement mechanism that provides immutable enterprise policy propagation.

**US 20250165890** (published 2025) describes a multi-agent AI system for automated software development with a MemGPT-style agent for dynamic context management via embedding storage, a Critic Agent for feedback, and task delegation. This application focuses on extended context handling in multi-agent LLMs but does not disclose individuated retrieval on shared knowledge graphs, agent-specific confidence thresholds, human-confirmed anchor nodes, or row-level security for graph namespace partitioning. The present invention is distinguished by the shared knowledge graph with per-agent interest tables and the two-stage commit architecture for knowledge proposal.

### 4.3 Unmet Need

There exists a need in the art for a system and method enabling multiple autonomous AI agents to share a single confidence-gated knowledge graph while retrieving individuated subsets of that graph at inference time based on each agent's functional role and associated interest profile. Furthermore, there is a need for enterprise policy enforcement mechanisms that guarantee certain organizational objectives and security facts are uniformly propagated to all agents regardless of their individual interest profiles, without permitting any agent to autonomously contradict or suppress those facts. Additionally, there is a need for tamper-evident provenance tracking of knowledge proposals from individual agents to the shared graph, with a two-stage commit mechanism that prevents any single agent from unilaterally polluting the shared knowledge base. Finally, there is a need for database-level write isolation that prevents agents from modifying knowledge outside their assigned functional namespace while permitting controlled cross-namespace reads. The present invention addresses all of these needs in an integrated architecture.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a distributed multi-agent knowledge graph architecture comprising five principal inventive elements that, in combination, enable role-specialized cognition across a shared organizational knowledge substrate.

**A Shared Confidence-Gated Knowledge Graph** comprising typed nodes and directed edges, wherein each node is annotated with a confidence score in the range [0,1] and a categorical type label (e.g., "person," "policy," "system," "threat," "objective"). The graph is stored in a persistent relational or graph database accessible to all agents in the system. Nodes represent discrete facts about the organizational environment; edges represent semantic relationships between those facts. The confidence score reflects the system's degree of certainty in a given node's accuracy, taking into account the source of the information, the number of independent observations that corroborate it, and any explicit human confirmation that has been applied to it.

**Per-Agent Interest Tables** as the primary inventive element. For each agent registered in the system, the interest table stores a set of records of the form (agent_id, topic, weight), where topic corresponds to a node category label in the shared knowledge graph, and weight is a positive real number. The interest table modifies the agent's effective confidence retrieval threshold for each node category according to the formula:

```
effective_threshold(agent, topic) = base_threshold / agent_weight(agent, topic)
```

where base_threshold is a system-wide default minimum confidence below which nodes are not ordinarily injected into agent context. When agent_weight for a given topic is greater than 1.0, the effective threshold is reduced below the base threshold, rendering the agent hypersensitive to nodes of that type -- nodes that would otherwise be filtered out as insufficiently confident are retrieved and injected into the agent's context. When agent_weight for a given topic is less than 1.0, the effective threshold is elevated above the base threshold, causing the agent to filter out nodes of that type unless their confidence is very high. This mechanism transforms the interest table into a retrieval specialization instrument that shapes each agent's perceptual aperture without requiring modification of the shared graph itself.

**Per-Agent Local Memory Chains** wherein each agent maintains a scoped session hash record chain that logs session summaries, interaction outcomes, and extracted entity candidates as a linked sequence of tamper-evident records. These local chains are the agent's working memory for active sessions. At defined intervals or upon session termination, entity candidates extracted from the local chain are proposed to the shared knowledge graph as candidate nodes. Proposed nodes are assigned an initial confidence value modulated by the proposing agent's interest weight for the entity type. Proposed nodes do not immediately become authoritative; they require accumulation of corroborating proposals from other agents or explicit human confirmation before their confidence rises above the base threshold. This two-stage commit architecture prevents any single agent from unilaterally polluting the shared graph with erroneous or low-quality information.

**Shared Human-Confirmed Anchor Nodes** representing a designated subset of nodes in the shared knowledge graph. Anchor nodes represent enterprise security objectives, organizational policies, and other foundational facts that must be uniformly enforced across all agents. Anchor nodes are distinguished from ordinary nodes by having their confidence score set to the maximum value (1.0) and by bearing a human-confirmation flag that is set only through an explicit out-of-band confirmation action by an authorized human administrator. Anchor nodes are exempt from autonomous modification: no agent in the system, regardless of its interest table weights or its accumulated interaction history, may propose a modification to an anchor node's content or confidence value. This property ensures that enterprise security objectives are uniformly enforced as graph-level facts that all agents inherit, creating a shared ground truth that cannot be circumvented by any individual agent's reasoning process.

**Role-Bound Namespace Partitioning via Row Level Security (RLS)** wherein each agent is assigned a node namespace corresponding to its functional role. Database-level RLS policies enforce that an agent may only write (create or modify) nodes within its assigned namespace, while reads are governed by a separate policy layer that grants each agent read access to a configurable set of shared namespaces in addition to its own. This architecture prevents namespace contamination: a customer-facing agent cannot write to the security namespace, and an infrastructure agent cannot overwrite nodes owned by the data analytics agent. The RLS-enforced namespace partitioning complements the interest table mechanism: the interest table governs what the agent retrieves and attends to (read specialization), while RLS governs what the agent is permitted to write (write isolation).

In combination, these five elements produce a system in which multiple agents share a single knowledge graph and yet exhibit meaningfully different perceptions of the same organizational reality at inference time -- a hive-mind topology with role-specialized cognition, unified policy enforcement, and tamper-evident provenance tracking.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the overall topology of the distributed multi-agent knowledge graph system, showing the shared knowledge graph database (100), the plurality of autonomous agents (10a, 10b, 10c, 10d), the per-agent interest tables (200a, 200b, 200c, 200d), the per-agent local memory chains (300a, 300b, 300c, 300d), the anchor node registry (400), the RLS policy enforcement layer (500), and the confidence-gated retrieval engine (600) that mediates between agents and the shared graph.

**FIG. 2** is a data flow diagram illustrating the per-agent confidence-gated retrieval process, showing the receipt of an inference request by a given agent, the lookup of the agent's interest table, the computation of effective confidence thresholds per node category, the graph traversal with threshold-filtered node selection, the anchor node mandatory inclusion step, and the injection of retrieved nodes into the agent's system prompt context window.

**FIG. 3** is a comparative diagram illustrating how two agents with different interest tables retrieve different subsets of nodes from the same shared knowledge graph during inference-time graph traversal. The diagram shows Agent A (a security agent with high interest weight for "threat" nodes and low interest weight for "customer" nodes) and Agent B (a customer-facing agent with high interest weight for "customer" nodes and low interest weight for "threat" nodes) receiving materially different context windows from the same underlying graph, with anchor nodes appearing in both context windows.

**FIG. 4** is a flowchart illustrating the two-stage commit process for knowledge proposal from a per-agent local memory chain to the shared knowledge graph, depicting the entity candidate extraction step, the initial confidence computation modulated by the proposing agent's interest weight, the candidate node insertion into the shared graph at sub-threshold confidence, the corroboration check from independent agent proposals, the human confirmation path, and the confidence elevation to authoritative status.

**FIG. 5** is a block diagram illustrating the Row Level Security (RLS) namespace partitioning architecture, showing the agent-to-namespace assignment registry, the database-level write policy enforcement layer, the separate read policy layer with cross-namespace access grants, and the interaction between RLS write isolation and interest-table-governed read specialization.

**FIG. 6** is a state diagram illustrating the lifecycle of a knowledge node in the shared graph, showing the states: Proposed (initial confidence below base threshold), Corroborated (confidence elevated by independent proposals), Authoritative (confidence above base threshold), Human-Confirmed (anchor status with maximum confidence and immutability flag), and Deprecated (confidence decayed below retention threshold), with transitions governed by agent proposals, corroboration events, human confirmations, and temporal decay functions.

**FIG. 7** is a schema diagram illustrating the data structures of the per-agent interest table, the knowledge graph node record, the anchor node record, the local memory chain record, and the namespace assignment record, showing field types, relationships, and constraints.

**FIG. 8** is a sequence diagram illustrating a complete inference cycle for two agents processing requests against the same shared knowledge graph, showing the divergent retrieval paths, the different context windows produced, and the subsequent knowledge proposal paths back to the shared graph.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 System Architecture Overview

Referring now to FIG. 1, the system of the present invention comprises a shared knowledge graph database (100) that stores the organizational knowledge substrate, a plurality of autonomous AI agents (10a, 10b, 10c, 10d) each associated with a functional role, a confidence-gated retrieval engine (600) that mediates all agent reads from the shared graph, and a namespace-partitioned write layer (500) that mediates all agent writes to the shared graph.

The shared knowledge graph database (100) is implemented as a persistent relational database (e.g., PostgreSQL with graph extensions) or a native graph database (e.g., Neo4j) and stores the following entity types:

- Knowledge nodes (110), each comprising a unique node identifier, a categorical type label, a content payload, a confidence score, a source attribution, a human-confirmation flag, a namespace identifier, and temporal metadata;
- Directed edges (120), each comprising a source node identifier, a target node identifier, a relationship type label, and a confidence score;
- Anchor nodes (130), a distinguished subset of knowledge nodes bearing maximum confidence (1.0) and the human-confirmation flag, exempt from autonomous modification.

Each autonomous agent (10x) is characterized by:

- An agent identifier;
- A functional role definition (e.g., "security_analyst," "customer_support," "infrastructure_monitor," "data_analyst");
- A per-agent interest table (200x) stored in the system database;
- A per-agent local memory chain (300x) maintained as a linked sequence of tamper-evident session records;
- An assigned write namespace corresponding to the agent's functional role;
- A set of read namespace grants specifying which additional namespaces the agent may read from.

In operation, when an agent (10x) receives an inference request, the confidence-gated retrieval engine (600) retrieves the agent's interest table (200x), computes effective confidence thresholds for each node category, traverses the shared knowledge graph (100) with threshold-filtered node selection, mandatorily includes all anchor nodes (130), and injects the retrieved node set into the agent's system prompt context window. The agent then processes the inference request with its individuated context window and may extract entity candidates from the interaction, which are logged to the agent's local memory chain (300x) and subsequently proposed to the shared graph through the two-stage commit mechanism.

### 7.2 Per-Agent Interest Table Data Structure

Referring now to FIG. 7, the per-agent interest table (200) is a persistent data structure stored in the system database. Each interest table comprises a set of records conforming to the following schema:

```
InterestTableRecord {
    agent_id: String,          // Foreign key to agent registry
    topic: String,             // Node category label (e.g., "threat", "policy", "person")
    weight: Float,             // Positive real number, default 1.0
    created_at: Timestamp,     // Record creation timestamp
    updated_at: Timestamp,     // Last modification timestamp
    initial_weight: Float,     // Role-defined initial weight (for drift bound enforcement)
    max_drift: Float           // Maximum permitted deviation from initial_weight
}
```

The interest table is initialized at agent registration time from a functional role definition template. For example, a security analyst agent might be initialized with the following interest table:

```
SECURITY_ANALYST_TEMPLATE = [
    { topic: "threat",     weight: 2.0,  max_drift: 0.5 },
    { topic: "policy",     weight: 1.8,  max_drift: 0.4 },
    { topic: "system",     weight: 1.5,  max_drift: 0.5 },
    { topic: "person",     weight: 0.8,  max_drift: 0.3 },
    { topic: "customer",   weight: 0.4,  max_drift: 0.2 },
    { topic: "product",    weight: 0.5,  max_drift: 0.3 },
    { topic: "objective",  weight: 1.5,  max_drift: 0.3 }
]
```

A customer support agent might be initialized with a materially different interest table:

```
CUSTOMER_SUPPORT_TEMPLATE = [
    { topic: "threat",     weight: 0.3,  max_drift: 0.2 },
    { topic: "policy",     weight: 1.0,  max_drift: 0.3 },
    { topic: "system",     weight: 0.5,  max_drift: 0.3 },
    { topic: "person",     weight: 1.5,  max_drift: 0.4 },
    { topic: "customer",   weight: 2.0,  max_drift: 0.5 },
    { topic: "product",    weight: 1.8,  max_drift: 0.4 },
    { topic: "objective",  weight: 1.0,  max_drift: 0.3 }
]
```

**7.2.1 Interest Weight Update with Drift Bound Enforcement**

Interest weights may be updated based on accumulated interaction history, subject to a maximum drift bound relative to the initial role-defined weights. The update mechanism is:

```
FUNCTION update_interest_weight(agent_id, topic, proposed_weight):
    record = GET_INTEREST_RECORD(agent_id, topic)

    // Enforce drift bound
    max_allowed = record.initial_weight + record.max_drift
    min_allowed = MAX(0.01, record.initial_weight - record.max_drift)

    clamped_weight = CLAMP(proposed_weight, min_allowed, max_allowed)

    record.weight = clamped_weight
    record.updated_at = current_time()

    PERSIST(record)
```

The drift bound enforcement ensures that agent specialization may evolve within role-appropriate bounds without permitting unbounded divergence from the agent's designated function. A security agent cannot, through accumulated interactions, reduce its threat interest weight to zero and become functionally indistinguishable from a customer support agent. The max_drift parameter is configurable per topic and per role, allowing administrators to control the degree of permitted adaptation.

### 7.3 Confidence-Gated Retrieval Engine

Referring now to FIG. 2, the confidence-gated retrieval engine (600) implements the core retrieval specialization mechanism of the present invention.

**7.3.1 Effective Threshold Computation**

Upon receiving an inference request for a given agent, the retrieval engine computes the effective confidence threshold for each node category:

```
FUNCTION compute_effective_thresholds(agent_id, base_threshold):
    interest_table = GET_INTEREST_TABLE(agent_id)
    effective_thresholds = {}

    FOR EACH record IN interest_table:
        // Core formula: higher weight = lower threshold = more sensitive retrieval
        effective_thresholds[record.topic] = base_threshold / record.weight

        // Clamp to valid range [0, 1]
        effective_thresholds[record.topic] = CLAMP(
            effective_thresholds[record.topic], 0.0, 1.0
        )

    // For node categories not in the interest table, use base_threshold
    RETURN effective_thresholds
```

For a base_threshold of 0.6:
- A security agent with threat weight 2.0 computes an effective threshold of 0.6 / 2.0 = 0.3 for threat nodes, meaning threat nodes with confidence as low as 0.3 are retrieved (hypersensitive retrieval).
- A customer support agent with threat weight 0.3 computes an effective threshold of 0.6 / 0.3 = 2.0, which is clamped to 1.0, meaning only threat nodes with maximum confidence (1.0) -- i.e., anchor nodes -- are retrieved (hyposensitive retrieval).

This asymmetry is the core inventive mechanism: the same shared graph produces materially different context windows for different agents based solely on the interest table configuration, without any modification to the graph itself.

**7.3.2 Graph Traversal with Threshold-Filtered Node Selection**

The retrieval engine traverses the shared knowledge graph using the computed effective thresholds:

```
FUNCTION retrieve_context(agent_id, base_threshold, max_context_tokens):
    effective_thresholds = compute_effective_thresholds(agent_id, base_threshold)
    read_namespaces = GET_READ_NAMESPACES(agent_id)

    retrieved_nodes = []
    token_count = 0

    // Phase 1: Mandatory anchor node inclusion
    anchor_nodes = SELECT * FROM knowledge_nodes
                   WHERE is_anchor = TRUE
                   AND namespace IN read_namespaces
                   ORDER BY relevance_score DESC

    FOR EACH node IN anchor_nodes:
        node_tokens = ESTIMATE_TOKENS(node.content)
        IF token_count + node_tokens <= max_context_tokens:
            retrieved_nodes.APPEND(node)
            token_count += node_tokens

    // Phase 2: Threshold-filtered retrieval
    candidate_nodes = SELECT * FROM knowledge_nodes
                      WHERE is_anchor = FALSE
                      AND namespace IN read_namespaces
                      ORDER BY confidence DESC, relevance_score DESC

    FOR EACH node IN candidate_nodes:
        effective_threshold = effective_thresholds.GET(
            node.type_label, base_threshold
        )

        IF node.confidence >= effective_threshold:
            node_tokens = ESTIMATE_TOKENS(node.content)
            IF token_count + node_tokens <= max_context_tokens:
                retrieved_nodes.APPEND(node)
                token_count += node_tokens

    RETURN retrieved_nodes
```

The retrieval algorithm implements a two-phase process. In Phase 1, all anchor nodes within the agent's read namespaces are mandatorily included in the context window, ensuring that enterprise security objectives and organizational policies are uniformly propagated to all agents. In Phase 2, non-anchor nodes are retrieved subject to the per-category effective confidence thresholds computed from the agent's interest table. Nodes are ordered by confidence (descending) and relevance score (descending) to prioritize the most reliable and contextually relevant information. The token budget constraint ensures that the retrieved context fits within the agent's available context window.

**7.3.3 Context Injection**

The retrieved node set is serialized and injected into the agent's system prompt context:

```
FUNCTION inject_context(agent_prompt, retrieved_nodes):
    context_block = "[KNOWLEDGE CONTEXT]\n"

    FOR EACH node IN retrieved_nodes:
        IF node.is_anchor:
            context_block += "[ANCHOR] "
        context_block += FORMAT(
            "[{type}] (confidence: {conf}) {content}\n",
            type = node.type_label,
            conf = node.confidence,
            content = node.content
        )

    context_block += "[END KNOWLEDGE CONTEXT]\n\n"

    // Prepend context to system prompt
    augmented_prompt = context_block + agent_prompt

    RETURN augmented_prompt
```

Anchor nodes are tagged with the `[ANCHOR]` prefix to signal to the LLM that these facts represent immutable enterprise directives that should take precedence over other contextual information.

### 7.4 Shared Knowledge Graph Node Schema

Referring now to FIG. 7, each knowledge node in the shared graph conforms to the following schema:

```
KnowledgeNode {
    node_id: UUID,                    // Unique node identifier
    type_label: String,               // Categorical type (e.g., "threat", "policy")
    content: Text,                    // Fact content payload
    confidence: Float,                // Confidence score in range [0, 1]
    source_agent_id: String | None,   // Proposing agent (None for human-created)
    source_type: Enum,                // "agent_proposal", "human_entry", "system_import"
    is_anchor: Boolean,               // Human-confirmed immutable status
    human_confirmed_by: String | None,// Administrator identifier
    human_confirmed_at: Timestamp | None,
    namespace: String,                // Owning namespace (e.g., "security", "customer")
    corroboration_count: Integer,     // Number of independent confirming proposals
    corroborating_agents: List[String],// Agent IDs that independently proposed this fact
    relevance_score: Float,           // Computed relevance for current query context
    created_at: Timestamp,
    updated_at: Timestamp,
    expires_at: Timestamp | None,     // Optional temporal expiry
    metadata: JSON                    // Extensible metadata
}
```

**7.4.1 Confidence Score Computation**

The confidence score for a knowledge node is computed based on multiple factors:

```
FUNCTION compute_confidence(node):
    IF node.is_anchor:
        RETURN 1.0  // Anchor nodes always have maximum confidence

    base_confidence = SOURCE_TYPE_BASE_CONFIDENCE[node.source_type]
    // "agent_proposal": 0.2, "human_entry": 0.7, "system_import": 0.5

    // Corroboration boost: each independent confirming agent adds confidence
    corroboration_boost = MIN(
        node.corroboration_count * CORROBORATION_INCREMENT,  // default: 0.1
        MAX_CORROBORATION_BOOST  // default: 0.5
    )

    // Temporal decay: confidence decreases over time for non-anchor nodes
    age_days = (current_time() - node.updated_at).days
    temporal_decay = MAX(0, 1.0 - (age_days * DECAY_RATE))  // default: 0.001/day

    confidence = MIN(1.0, (base_confidence + corroboration_boost) * temporal_decay)

    RETURN confidence
```

This computation ensures that agent-proposed nodes start at low confidence and gain authority through independent corroboration, while human-entered nodes start at higher confidence. All non-anchor nodes are subject to temporal decay, incentivizing periodic revalidation of the knowledge base.

### 7.5 Anchor Node Enforcement Mechanism

Referring now to FIG. 6, anchor nodes implement the enterprise policy enforcement layer of the present invention.

**7.5.1 Anchor Node Designation**

Anchor nodes are created or promoted through an explicit out-of-band human confirmation action:

```
FUNCTION designate_anchor_node(node_id, admin_id, admin_credential):
    // Step 1: Verify administrator authority
    IF NOT verify_admin_authority(admin_id, admin_credential):
        RAISE UnauthorizedError("Insufficient authority for anchor designation")

    // Step 2: Retrieve and promote node
    node = GET_NODE(node_id)
    node.is_anchor = TRUE
    node.confidence = 1.0
    node.human_confirmed_by = admin_id
    node.human_confirmed_at = current_time()

    // Step 3: Log anchor designation in audit trail
    LOG_ANCHOR_EVENT(node_id, admin_id, "ANCHOR_DESIGNATED")

    PERSIST(node)
```

**7.5.2 Anchor Node Immutability Enforcement**

All write operations to the shared knowledge graph pass through an anchor enforcement check:

```
FUNCTION enforce_anchor_immutability(operation, node_id, requesting_agent_id):
    node = GET_NODE(node_id)

    IF node.is_anchor == TRUE:
        IF operation IN ["UPDATE", "DELETE", "MODIFY_CONFIDENCE"]:
            LOG_VIOLATION(requesting_agent_id, node_id, operation)
            RAISE AnchorViolationError(
                "Agent {agent} attempted to {op} anchor node {node}",
                agent = requesting_agent_id,
                op = operation,
                node = node_id
            )

    // Non-anchor nodes: proceed with standard write path
    RETURN ALLOW
```

This enforcement is implemented at the database trigger level, ensuring that even direct database access by a compromised agent cannot modify anchor node content or confidence values.

**7.5.3 Mandatory Anchor Node Propagation**

During inference-time retrieval, anchor nodes are always included in every agent's context window regardless of the agent's interest table configuration:

```
FUNCTION is_retrievable(node, agent_id, effective_thresholds):
    // Anchor nodes are always retrievable
    IF node.is_anchor:
        RETURN TRUE

    // Non-anchor nodes: apply interest-table-modulated threshold
    threshold = effective_thresholds.GET(node.type_label, base_threshold)
    RETURN node.confidence >= threshold
```

This mechanism ensures that enterprise security objectives, compliance directives, and organizational policies are uniformly visible to all agents. A customer-facing agent with low interest in "policy" nodes will still receive anchor policy nodes in its context, ensuring that it cannot violate organizational policy by virtue of its retrieval specialization.

### 7.6 Per-Agent Local Memory Chain and Two-Stage Commit

Referring now to FIG. 4, each agent maintains a per-agent local memory chain (300) as its working memory for active sessions.

**7.6.1 Local Memory Chain Record Schema**

```
LocalMemoryRecord {
    record_id: UUID,
    agent_id: String,
    session_id: String,
    sequence_number: Integer,        // Monotonically increasing within session
    content: Text,                   // Session summary or interaction record
    entity_candidates: List[EntityCandidate],  // Extracted candidate facts
    previous_hash: String,           // SHA-256 hash of previous record (chain link)
    record_hash: String,             // SHA-256 hash of this record
    created_at: Timestamp
}

EntityCandidate {
    proposed_type: String,           // Node category (e.g., "threat", "person")
    proposed_content: Text,          // Fact content
    extraction_confidence: Float,    // Agent's confidence in extraction accuracy
    source_context: Text             // Source interaction context
}
```

**7.6.2 Tamper-Evident Hash Chain**

Each record in the local memory chain includes a hash link to the previous record, creating a tamper-evident chain:

```
FUNCTION append_to_chain(agent_id, session_id, content, entity_candidates):
    previous_record = GET_LATEST_RECORD(agent_id, session_id)

    IF previous_record IS NOT NONE:
        previous_hash = previous_record.record_hash
        sequence_number = previous_record.sequence_number + 1
    ELSE:
        previous_hash = SHA256("GENESIS:" + agent_id + ":" + session_id)
        sequence_number = 0

    record = LocalMemoryRecord(
        record_id = GENERATE_UUID(),
        agent_id = agent_id,
        session_id = session_id,
        sequence_number = sequence_number,
        content = content,
        entity_candidates = entity_candidates,
        previous_hash = previous_hash,
        created_at = current_time()
    )

    // Compute record hash over all fields including previous_hash
    hash_input = CONCATENATE(
        record.agent_id, record.session_id,
        str(record.sequence_number), record.content,
        JSON_SERIALIZE(record.entity_candidates),
        record.previous_hash
    )
    record.record_hash = SHA256(hash_input)

    PERSIST(record)
    RETURN record
```

**7.6.3 Two-Stage Commit: Proposal to Shared Graph**

At defined intervals (e.g., session termination, periodic flush) or upon explicit trigger, entity candidates from the local memory chain are proposed to the shared knowledge graph:

```
FUNCTION propose_to_shared_graph(agent_id, entity_candidate):
    // Step 1: Compute initial confidence modulated by proposing agent's interest
    interest_record = GET_INTEREST_RECORD(agent_id, entity_candidate.proposed_type)

    IF interest_record IS NOT NONE:
        // Higher interest weight = higher initial confidence for proposals of this type
        initial_confidence = BASE_PROPOSAL_CONFIDENCE * (
            interest_record.weight / MAX_INTEREST_WEIGHT
        )
        initial_confidence = MIN(initial_confidence, MAX_INITIAL_CONFIDENCE)
    ELSE:
        initial_confidence = BASE_PROPOSAL_CONFIDENCE  // default: 0.2

    // Step 2: Check for existing similar nodes (deduplication)
    existing_node = FIND_SIMILAR_NODE(
        entity_candidate.proposed_type,
        entity_candidate.proposed_content,
        SIMILARITY_THRESHOLD  // default: 0.85
    )

    IF existing_node IS NOT NONE:
        // Corroboration: increment corroboration count
        IF agent_id NOT IN existing_node.corroborating_agents:
            existing_node.corroboration_count += 1
            existing_node.corroborating_agents.APPEND(agent_id)
            existing_node.confidence = compute_confidence(existing_node)
            PERSIST(existing_node)
            RETURN existing_node

    // Step 3: Create new candidate node
    new_node = KnowledgeNode(
        node_id = GENERATE_UUID(),
        type_label = entity_candidate.proposed_type,
        content = entity_candidate.proposed_content,
        confidence = initial_confidence,
        source_agent_id = agent_id,
        source_type = "agent_proposal",
        is_anchor = FALSE,
        namespace = GET_AGENT_NAMESPACE(agent_id),
        corroboration_count = 0,
        corroborating_agents = [],
        created_at = current_time()
    )

    // Step 4: Enforce RLS write policy
    IF NOT check_write_permission(agent_id, new_node.namespace):
        RAISE NamespaceViolationError(
            "Agent {agent} cannot write to namespace {ns}",
            agent = agent_id, ns = new_node.namespace
        )

    PERSIST(new_node)
    RETURN new_node
```

The two-stage commit mechanism ensures that agent-proposed knowledge enters the shared graph at low initial confidence and must accumulate corroboration from independent agents or receive explicit human confirmation before it becomes authoritative. This prevents any single agent from polluting the shared knowledge base with hallucinated, erroneous, or adversarial facts.

### 7.7 Role-Bound Namespace Partitioning via Row Level Security

Referring now to FIG. 5, the system implements role-bound namespace partitioning using database-level Row Level Security (RLS) policies.

**7.7.1 Namespace Assignment Registry**

Each agent is assigned to a primary write namespace and granted read access to a configurable set of additional namespaces:

```
NamespaceAssignment {
    agent_id: String,
    write_namespace: String,           // Primary write namespace
    read_namespaces: List[String],     // All namespaces agent can read from
    created_at: Timestamp,
    updated_at: Timestamp
}
```

Example namespace assignments:

```
ASSIGNMENTS = [
    {
        agent_id: "alfred_security",
        write_namespace: "security",
        read_namespaces: ["security", "policy", "system", "shared"]
    },
    {
        agent_id: "alfred_customer",
        write_namespace: "customer",
        read_namespaces: ["customer", "product", "policy", "shared"]
    },
    {
        agent_id: "alfred_infra",
        write_namespace: "infrastructure",
        read_namespaces: ["infrastructure", "system", "security", "shared"]
    },
    {
        agent_id: "alfred_analytics",
        write_namespace: "analytics",
        read_namespaces: ["analytics", "customer", "product", "shared"]
    }
]
```

**7.7.2 Database-Level RLS Policy Implementation**

The RLS policies are implemented as database-level policies (illustrated for PostgreSQL):

```sql
-- Write policy: agents can only write to their assigned namespace
CREATE POLICY agent_write_policy ON knowledge_nodes
    FOR INSERT
    WITH CHECK (
        namespace = (
            SELECT write_namespace
            FROM namespace_assignments
            WHERE agent_id = current_setting('app.current_agent_id')
        )
    );

-- Update policy: agents can only update nodes in their write namespace
-- AND cannot modify anchor nodes
CREATE POLICY agent_update_policy ON knowledge_nodes
    FOR UPDATE
    USING (
        namespace = (
            SELECT write_namespace
            FROM namespace_assignments
            WHERE agent_id = current_setting('app.current_agent_id')
        )
        AND is_anchor = FALSE
    );

-- Read policy: agents can read from their granted read namespaces
CREATE POLICY agent_read_policy ON knowledge_nodes
    FOR SELECT
    USING (
        namespace IN (
            SELECT unnest(read_namespaces)
            FROM namespace_assignments
            WHERE agent_id = current_setting('app.current_agent_id')
        )
    );

-- Anchor node protection: prevent any agent from modifying anchor nodes
CREATE POLICY anchor_protection_policy ON knowledge_nodes
    FOR UPDATE
    USING (is_anchor = FALSE)
    WITH CHECK (is_anchor = FALSE);

-- Anchor node delete protection
CREATE POLICY anchor_delete_protection ON knowledge_nodes
    FOR DELETE
    USING (is_anchor = FALSE);
```

**7.7.3 Interaction Between RLS and Interest Tables**

The RLS namespace partitioning and the interest table mechanism operate as complementary layers:

- **RLS** governs the hard boundary of what an agent is *permitted* to access (read) and *permitted* to modify (write). It is a security enforcement mechanism.
- **Interest tables** govern the soft boundary of what an agent *attends to* within its permitted read set. It is a retrieval specialization mechanism.

An agent's interest table may assign low weight to a topic category within a namespace it is permitted to read. In this case, the agent is *authorized* to retrieve those nodes (RLS permits the read) but *chooses not to attend* to them unless their confidence is very high (the interest table raises the effective threshold). Conversely, an agent cannot use a high interest weight to retrieve nodes from a namespace it is not permitted to read -- the RLS policy enforcement supersedes the interest table modulation.

This layered architecture provides defense in depth: even if an agent's interest table is compromised or misconfigured, the RLS policies ensure that the agent cannot access or modify data outside its authorized namespaces.

### 7.8 Comparative Retrieval Example

Referring now to FIG. 3, the following example illustrates the divergent retrieval behavior of two agents operating against the same shared knowledge graph.

Consider a shared knowledge graph containing the following nodes:

| Node | Type | Confidence | Is Anchor |
|------|------|------------|-----------|
| N1 | threat | 0.9 | No |
| N2 | threat | 0.4 | No |
| N3 | customer | 0.8 | No |
| N4 | customer | 0.3 | No |
| N5 | policy | 1.0 | Yes |
| N6 | system | 0.6 | No |
| N7 | product | 0.7 | No |

With a system base_threshold of 0.6:

**Agent A (Security Analyst):** Interest weights: threat=2.0, customer=0.4, policy=1.5, system=1.5, product=0.5

- Effective threshold for "threat": 0.6 / 2.0 = 0.30 -- retrieves N1 (0.9 >= 0.30) and N2 (0.4 >= 0.30)
- Effective threshold for "customer": 0.6 / 0.4 = 1.50, clamped to 1.0 -- retrieves neither N3 nor N4
- N5 retrieved mandatorily (anchor node)
- Effective threshold for "system": 0.6 / 1.5 = 0.40 -- retrieves N6 (0.6 >= 0.40)
- Effective threshold for "product": 0.6 / 0.5 = 1.20, clamped to 1.0 -- does not retrieve N7

**Agent A context window:** {N1, N2, N5, N6} -- threat-focused with security policy

**Agent B (Customer Support):** Interest weights: threat=0.3, customer=2.0, policy=1.0, system=0.5, product=1.8

- Effective threshold for "threat": 0.6 / 0.3 = 2.0, clamped to 1.0 -- does not retrieve N1 or N2
- Effective threshold for "customer": 0.6 / 2.0 = 0.30 -- retrieves N3 (0.8 >= 0.30) and N4 (0.3 >= 0.30)
- N5 retrieved mandatorily (anchor node)
- Effective threshold for "system": 0.6 / 0.5 = 1.20, clamped to 1.0 -- does not retrieve N6
- Effective threshold for "product": 0.6 / 1.8 = 0.33 -- retrieves N7 (0.7 >= 0.33)

**Agent B context window:** {N3, N4, N5, N7} -- customer-focused with product knowledge

Both agents operate against the same shared graph and both receive the anchor policy node N5, yet their context windows are materially different. Agent A sees threat intelligence that Agent B does not attend to; Agent B sees customer and product information that Agent A filters out. This is achieved solely through the interest table mechanism without any modification to the shared graph.

### 7.9 Node Lifecycle State Machine

Referring now to FIG. 6, each knowledge node progresses through a defined lifecycle with the following states and transitions:

**States:**

1. **PROPOSED** -- Initial state for agent-proposed nodes. Confidence is below base_threshold. Node is visible only to agents with sufficiently low effective thresholds for the node's type category.

2. **CORROBORATED** -- Node has received independent corroboration from one or more additional agents. Confidence has been elevated by corroboration increments but may still be below base_threshold.

3. **AUTHORITATIVE** -- Node confidence has risen above base_threshold through accumulated corroboration or human entry. Node is visible to agents with default interest weights.

4. **HUMAN_CONFIRMED** -- Node has been designated as an anchor node by a human administrator. Confidence is set to 1.0, immutability flag is set, and the node is mandatorily included in all agent context windows.

5. **DEPRECATED** -- Node confidence has decayed below a retention threshold through temporal decay and absence of revalidation. Node is scheduled for archival or deletion.

**Transitions:**

- PROPOSED -> CORROBORATED: Triggered by independent corroboration from a second agent
- PROPOSED -> AUTHORITATIVE: Triggered by sufficient corroboration to exceed base_threshold, or by human elevation
- CORROBORATED -> AUTHORITATIVE: Triggered by accumulated corroboration exceeding base_threshold
- AUTHORITATIVE -> HUMAN_CONFIRMED: Triggered by explicit human administrator designation
- PROPOSED -> DEPRECATED: Triggered by temporal decay without corroboration
- CORROBORATED -> DEPRECATED: Triggered by temporal decay without further corroboration
- AUTHORITATIVE -> DEPRECATED: Triggered by temporal decay without revalidation
- HUMAN_CONFIRMED -> AUTHORITATIVE: Triggered by explicit human de-anchoring (rare administrative action)

### 7.10 System Integration and Deployment Architecture

The system is designed for deployment on cloud infrastructure with the following components:

- **Database Layer:** PostgreSQL with RLS policies enabled, or Neo4j with role-based access control, hosting the shared knowledge graph, interest tables, namespace assignments, and local memory chains.
- **Retrieval Engine:** A stateless service that receives agent inference requests, performs interest-table-modulated graph traversal, and returns context-injected prompts. Multiple instances may be deployed for horizontal scalability.
- **Agent Runtime:** Each agent operates as an independent process or container with its own LLM provider connection, receiving augmented prompts from the retrieval engine and returning interaction records to its local memory chain.
- **Proposal Processor:** An asynchronous service that processes entity candidate proposals from agent local memory chains, performs deduplication, corroboration matching, and confidence computation.
- **Administration Interface:** A secured interface for human administrators to designate anchor nodes, manage namespace assignments, configure interest table templates, and monitor system health.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented multi-agent artificial intelligence system comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to:

(a) maintain a shared knowledge graph comprising a plurality of knowledge nodes stored in a persistent database, each knowledge node comprising a unique node identifier, a categorical type label, a content payload, and a confidence score in a range of zero to one;

(b) maintain, for each agent in a plurality of autonomous agents, a per-agent interest table comprising a set of records, each record comprising an agent identifier, a topic corresponding to a categorical type label in the shared knowledge graph, and a weight comprising a positive real number;

(c) upon receiving an inference request for a first agent, compute an effective confidence threshold for each node category by dividing a system-wide base threshold by the first agent's interest weight for the respective node category;

(d) traverse the shared knowledge graph and retrieve knowledge nodes whose confidence scores meet or exceed the computed effective confidence thresholds for their respective node categories;

(e) inject the retrieved knowledge nodes into a context window of the first agent for processing the inference request;

whereby agents with different interest tables retrieve different subsets of knowledge nodes from the same shared knowledge graph during inference-time graph traversal, producing individuated context windows from a unified knowledge substrate.

**Claim 2.** The system of Claim 1, wherein the shared knowledge graph further comprises a plurality of anchor nodes, each anchor node having a confidence score set to a maximum value of one and bearing a human-confirmation flag that is set only through an explicit out-of-band confirmation action by an authorized human administrator, and wherein anchor nodes are exempt from autonomous modification by any agent in the plurality.

**Claim 3.** The system of Claim 2, wherein the instructions further cause the system to mandatorily include all anchor nodes within the first agent's read namespaces in the context window of the first agent regardless of the first agent's interest table configuration, thereby ensuring that enterprise security objectives encoded as anchor nodes are uniformly propagated to all agents.

**Claim 4.** The system of Claim 1, wherein each agent in the plurality maintains a per-agent local memory chain comprising a linked sequence of tamper-evident records, each record comprising a session summary, extracted entity candidates, a hash of the previous record in the sequence, and a hash of the current record computed over all record fields including the previous record hash.

**Claim 5.** The system of Claim 4, wherein the instructions further cause the system to:

(f) extract entity candidates from the per-agent local memory chain;

(g) propose the entity candidates to the shared knowledge graph as candidate nodes at an initial confidence value modulated by the proposing agent's interest weight for the entity candidate's node category, wherein a higher interest weight for the relevant category produces a higher initial confidence value;

(h) upon receiving a corroborating proposal from a second agent independently proposing a substantially similar fact, increment a corroboration count for the candidate node and elevate the candidate node's confidence score; and

(i) upon the candidate node's confidence score meeting or exceeding the system-wide base threshold through accumulated corroboration or explicit human confirmation, designate the candidate node as authoritative in the shared graph.

**Claim 6.** The system of Claim 1, wherein each agent in the plurality is assigned a write namespace corresponding to the agent's functional role, and wherein database-level Row Level Security policies enforce that each agent may only create or modify knowledge nodes within the agent's assigned write namespace, while read access is governed by a separate policy layer granting each agent read access to a configurable set of shared namespaces in addition to the agent's own namespace.

**Claim 7.** The system of Claim 6, wherein the Row Level Security policies further enforce that anchor nodes are exempt from update and delete operations by any agent, regardless of namespace assignment.

**Claim 8.** The system of Claim 1, wherein each per-agent interest table is initialized from a functional role definition template at agent registration time, and wherein interest weights may be updated based on accumulated interaction history subject to a maximum drift bound relative to the initial role-defined weights, such that agent specialization may evolve within role-appropriate bounds without permitting unbounded divergence from the agent's designated function.

**Claim 9.** A computer-implemented method for individuating agent behavior in a multi-agent artificial intelligence system sharing a common knowledge graph, the method comprising:

(a) maintaining a shared knowledge graph comprising a plurality of knowledge nodes, each knowledge node annotated with a confidence score and a categorical type label;

(b) maintaining a first interest table for a first agent and a second interest table for a second agent, wherein the first interest table and the second interest table comprise different topic-to-weight mappings;

(c) receiving an inference request for the first agent;

(d) computing a first set of effective confidence thresholds by dividing a system-wide base threshold by the first agent's interest weights from the first interest table for each node category;

(e) traversing the shared knowledge graph using the first set of effective confidence thresholds and retrieving a first subset of knowledge nodes whose confidence scores meet or exceed the respective thresholds;

(f) injecting the first subset of knowledge nodes into a context window of the first agent;

(g) receiving an inference request for the second agent against the same shared knowledge graph;

(h) computing a second set of effective confidence thresholds by dividing the same system-wide base threshold by the second agent's interest weights from the second interest table for each node category;

(i) traversing the shared knowledge graph using the second set of effective confidence thresholds and retrieving a second subset of knowledge nodes whose confidence scores meet or exceed the respective thresholds;

(j) injecting the second subset of knowledge nodes into a context window of the second agent;

whereby the first and second agents retrieve different subsets of knowledge nodes from the same shared knowledge graph, producing individuated context windows from a unified knowledge substrate.

**Claim 10.** The method of Claim 9, further comprising:

(k) mandatorily including, in both the context window of the first agent and the context window of the second agent, all anchor nodes in the shared knowledge graph, wherein anchor nodes are knowledge nodes having maximum confidence scores and bearing human-confirmation flags, and wherein anchor nodes are exempt from autonomous modification by any agent.

**Claim 11.** The method of Claim 9, further comprising:

(k) extracting entity candidates from interactions of the first agent;

(l) logging the entity candidates in a per-agent local memory chain maintained by the first agent as tamper-evident hash-linked records;

(m) proposing the entity candidates to the shared knowledge graph at initial confidence values modulated by the first agent's interest weights for the respective entity categories;

(n) detecting a corroborating proposal from the second agent proposing a substantially similar fact; and

(o) elevating the confidence score of the proposed knowledge node upon corroboration.

**Claim 12.** A computer-implemented system for role-specialized knowledge retrieval in a multi-agent environment, the system comprising:

a shared knowledge graph database storing a plurality of knowledge nodes, each knowledge node comprising a confidence score, a categorical type label, a namespace identifier, and a content payload, and further storing a plurality of anchor nodes distinguished by maximum confidence scores and human-confirmation flags;

a plurality of autonomous agents, each agent associated with a functional role, a per-agent interest table comprising topic-to-weight mappings, an assigned write namespace, and a set of read namespace grants;

a confidence-gated retrieval engine configured to, for each agent receiving an inference request: (i) compute effective confidence thresholds per node category by dividing a system-wide base threshold by the agent's interest weights, (ii) traverse the shared knowledge graph retrieving nodes meeting the computed thresholds within the agent's read namespaces, (iii) mandatorily include all anchor nodes, and (iv) inject retrieved nodes into the agent's context window;

a namespace-partitioned write layer enforcing, via database-level Row Level Security policies, that each agent may only write to the agent's assigned namespace and that anchor nodes are exempt from autonomous modification; and

a two-stage commit processor configured to receive entity candidate proposals from agent local memory chains, assign initial confidence values modulated by proposing agent interest weights, and elevate node confidence upon independent corroboration or human confirmation.

### Dependent Claims

**Claim 13.** The system of Claim 12, wherein the confidence-gated retrieval engine further applies a token budget constraint, ordering retrieved nodes by confidence score and relevance score and including nodes in the context window until a maximum context token limit is reached, with anchor nodes receiving priority inclusion before non-anchor nodes.

**Claim 14.** The system of Claim 12, wherein each knowledge node further comprises a corroboration count and a list of corroborating agent identifiers, and wherein the confidence score of a knowledge node is computed as a function of a source-type base confidence, a corroboration boost proportional to the corroboration count, and a temporal decay factor based on the elapsed time since the node was last updated.

**Claim 15.** The system of Claim 12, wherein the per-agent interest table further comprises, for each record, an initial weight set from a functional role template and a maximum drift bound, and wherein updates to interest weights are clamped to a range defined by the initial weight plus or minus the maximum drift bound.

**Claim 16.** The system of Claim 12, wherein the per-agent local memory chain comprises a linked sequence of records, each record comprising a SHA-256 hash of the previous record in the sequence and a SHA-256 hash computed over all fields of the current record including the previous record hash, forming a tamper-evident hash chain.

**Claim 17.** The system of Claim 12, wherein the two-stage commit processor is further configured to perform deduplication by comparing proposed entity candidates against existing nodes in the shared knowledge graph using a configurable similarity threshold, and upon detecting a substantially similar existing node, incrementing the existing node's corroboration count rather than creating a duplicate node.

**Claim 18.** The method of Claim 9, wherein a first interest weight for a first node category in the first interest table exceeds 1.0 such that the first agent's effective confidence threshold for the first node category is reduced below the system-wide base threshold, rendering the first agent hypersensitive to nodes of the first node category; and a second interest weight for the first node category in the second interest table is less than 1.0 such that the second agent's effective confidence threshold for the first node category is elevated above the system-wide base threshold, rendering the second agent hyposensitive to nodes of the first node category.

**Claim 19.** The system of Claim 1, wherein the confidence-gated retrieval engine applies the effective threshold computation as:

```
effective_threshold(agent, topic) = base_threshold / agent_weight(agent, topic)
```

wherein the result is clamped to the range [0, 1], and wherein the base_threshold is a configurable system-wide parameter.

**Claim 20.** The system of Claim 12, wherein the namespace-partitioned write layer and the confidence-gated retrieval engine operate as complementary layers, wherein the namespace-partitioned write layer enforces a hard boundary of what each agent is permitted to access and modify, and the interest table governs a soft boundary of what each agent attends to within the agent's permitted read set, providing defense-in-depth such that even if an agent's interest table is compromised or misconfigured, the Row Level Security policies prevent access to or modification of data outside the agent's authorized namespaces.

---

## 9. ABSTRACT

A computer-implemented system and method for distributed multi-agent knowledge graph architecture with per-agent interest tables and role-bound confidence threshold modulation. A plurality of autonomous AI agents share a single confidence-gated knowledge graph stored in a persistent database. Each agent is associated with a per-agent interest table comprising topic-to-weight mappings that modulate the agent's effective confidence injection threshold for different node categories during inference-time graph traversal. The effective threshold is computed by dividing a system-wide base threshold by the agent's interest weight for each category, such that agents with high interest in a topic retrieve nodes at lower confidence levels (hypersensitive retrieval) while agents with low interest filter those nodes unless confidence is very high. Human-confirmed anchor nodes with maximum confidence are exempt from autonomous modification and mandatorily included in all agent context windows, ensuring uniform enterprise policy enforcement. Each agent maintains a tamper-evident local memory chain from which entity candidates are proposed to the shared graph through a two-stage commit mechanism requiring corroboration from independent agents or explicit human confirmation. Database-level Row Level Security policies enforce role-bound namespace partitioning for write isolation. The architecture enables individuated agent behavior -- different agents perceive different aspects of the same shared organizational reality -- without separate knowledge bases, creating a hive-mind topology with role-specialized cognition and unified policy enforcement.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-016
