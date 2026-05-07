# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-017
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**System and Method for Pseudo-Generational Agent Memory with Delta-Merge Protocol and Agent Confidence Reputation Scoring**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to the following U.S. Provisional Patent Applications, the disclosures of which are incorporated herein by reference in their entirety:

U.S. Provisional Patent Application Serial No. 64/005,467, entitled "System and Method for Three-Tier Hierarchical Memory Architecture for Autonomous AI Agents" (Docket No. SALUCA-015), filed concurrently herewith, which discloses a three-tier memory hierarchy comprising hot, warm, and cold storage tiers with confidence-scored knowledge graph nodes, an Evidence Validation Loop (EVL), and a Human Confirmation Gateway (HCG) for autonomous agent memory management.

U.S. Provisional Patent Application Serial No. [SALUCA-016], entitled "System and Method for Multi-Agent Interest Tables with Shared Knowledge Graph Access" (Docket No. SALUCA-016), filed concurrently herewith, which discloses interest table weight vectors for multi-agent graph traversal, row-level security (RLS) policies for tenant-scoped graph access, and shared knowledge graph architectures for collaborative multi-agent systems.

U.S. Provisional Patent Application Serial No. [SALUCA-020], entitled "System and Method for Closed-Loop Agent Integrity Architecture" (Docket No. SALUCA-020), filed concurrently herewith, which discloses hash-chained audit logging for agent memory operations, integrity verification of knowledge graph mutations, and tamper-evident provenance records for agent-originated data.

The present invention extends and builds upon the memory architectures, confidence scoring mechanisms, and audit logging subsystems disclosed in the above-referenced applications to provide a complete generational agent spawning, lineage tracking, and confidence-weighted delta-merge framework for multi-agent knowledge graph systems.

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of artificial intelligence and, more particularly, to systems and methods for managing knowledge propagation, quality assurance, and provenance tracking across hierarchical generations of autonomous AI agents operating on shared confidence-scored knowledge graphs. The invention encompasses a delta-merge protocol for reconciling child agent knowledge back into parent agent graphs, an agent confidence reputation (ACR) scoring system that dynamically adjusts trust levels based on historical merge acceptance rates, a spawned-by lineage graph enabling full provenance tracking through generational chains, generational depth limits with confidence decay to prevent unbounded spawning, targeted rollback mechanisms for quarantining knowledge contributed by compromised agents via lineage traversal, Byzantine majority confidence boosting for independently corroborated knowledge, and personality inheritance with bounded drift for interest table weight propagation across agent generations.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

The deployment of large language model (LLM)-based autonomous AI agents has evolved from single-agent architectures to multi-agent systems in which multiple specialized agents collaborate to accomplish complex tasks. These multi-agent systems increasingly require persistent knowledge stores -- rather than ephemeral conversation histories -- to accumulate, validate, and share learned information across agent lifetimes and task boundaries.

In the current state of the art, multi-agent frameworks provide varying levels of memory sharing and coordination:

**AutoGen** (Microsoft, 2023-2025) implements a conversational multi-agent framework in which agents communicate through message passing. AutoGen agents maintain conversation histories that can be shared within group chat contexts, but the framework does not provide a persistent knowledge graph, does not implement confidence scoring on shared knowledge, does not track agent lineage or provenance, and does not implement any mechanism for scoring the quality of knowledge contributed by individual agents.

**CrewAI** (2024-2025) provides a role-based multi-agent orchestration framework in which agents are assigned specialized roles within a crew. CrewAI implements shared memory as sequential task output passing between agents, with basic memory management capabilities. However, CrewAI's shared memory is flat text rather than a structured knowledge graph, does not implement confidence gating on shared knowledge, does not track which agent contributed which knowledge, and does not provide mechanisms for evaluating per-agent knowledge quality over time.

**LangChain/LangGraph** (2023-2026) offers the most sophisticated memory abstractions among current frameworks, including multiple storage backends (vector databases, relational databases), composable memory modules, and state persistence through built-in checkpointing with time-travel capabilities. LangGraph enables agents to share typed state objects flowing through directed graph workflows. However, LangChain/LangGraph does not implement confidence scoring on knowledge nodes, does not track per-agent contribution quality, does not provide generational spawning with lineage tracking, and does not implement delta-merge protocols for reconciling agent-generated knowledge.

**MemGPT/Letta** (2023-2025) implements a virtual context management system for LLM agents, employing a tiered memory architecture inspired by operating system memory hierarchies. MemGPT enables a single agent to manage memory across main context, archival storage, and recall storage tiers. However, MemGPT is designed for single-agent memory management, does not support multi-agent shared graphs, does not implement agent spawning or lineage tracking, and does not provide confidence-weighted knowledge merging between agents.

**Mem0** (2024-2026) provides multi-level memory supporting user-level, session-level, and agent-level scopes, using vector search combined with metadata filtering for hybrid retrieval. While Mem0 includes version control for memories, it does not implement confidence-scored knowledge graphs, does not track per-agent knowledge quality reputation, and does not provide generational agent spawning with delta-merge reconciliation.

### 4.2 Limitations of Existing Solutions

Several existing systems and publications attempt to address aspects of multi-agent knowledge management, but each suffers from significant limitations:

**US20250131289A1** (published 2025) describes LLM agents traversing a weighted knowledge graph extracted from datasets, where edge weights represent confidence based on observed occurrence frequency, enabling multi-agent navigation for comprehensive responses. However, this patent addresses static graph traversal with frequency-based weights and does not contemplate: (a) dynamic per-agent reputation scoring based on historical contribution quality; (b) generational agent spawning with lineage tracking; (c) delta-merge protocols for reconciling child-agent-generated knowledge back into parent graphs; or (d) confidence decay across generational depth.

**US 12,481,215** (granted November 2025) discloses knowledge graph creation with dynamic segmentation, entity/relationship extraction, and graph-based embeddings for real-time updates. This patent addresses graph construction and update mechanics but does not implement: (a) multi-agent contribution tracking; (b) per-agent confidence reputation; (c) generational spawning architectures; or (d) merge-based reconciliation protocols with acceptance-rate feedback.

**US 12,399,924** (granted August 2025) discloses multi-model evaluation in LLMs for improving accuracy. While this patent addresses output quality evaluation, it operates at the model inference level rather than the knowledge graph level and does not implement: (a) persistent per-agent reputation scores that influence future knowledge acceptance; (b) generational lineage tracking; or (c) structured delta-merge protocols.

**Reputation systems in distributed computing** (e.g., EigenTrust, PeerTrust) provide reputation scoring for peer-to-peer networks based on transaction quality. These systems address network-level trust for file sharing and service provision but do not contemplate: (a) application to knowledge graph node quality in AI agent systems; (b) confidence-weighted merge operations on graph structures; (c) generational depth decay; or (d) lineage-based targeted rollback of contributed knowledge.

**Byzantine fault tolerance (BFT) protocols** (e.g., PBFT, Tendermint) provide consensus mechanisms for distributed systems where a fraction of participants may be faulty or malicious. While BFT protocols address the general problem of reaching agreement in the presence of adversarial nodes, they do not implement: (a) confidence-scored knowledge graphs with per-node quality tracking; (b) agent reputation derived from knowledge contribution history; (c) generational spawning with lineage-based rollback; or (d) confidence boosting through independent corroboration by multiple spawned agents.

**Knowledge graph merge operations** in ontology engineering (e.g., ontology alignment, graph merging) address the structural problem of combining multiple knowledge representations. These approaches focus on schema alignment and entity resolution but do not implement: (a) confidence scoring based on the contributing agent's historical accuracy; (b) generational depth decay on merged knowledge; (c) asynchronous reputation feedback loops; or (d) lineage-based quarantine and rollback mechanisms.

### 4.3 Unmet Need

There exists a need in the art for an integrated system that: (a) enables parent agents to spawn child agents for bounded tasks with inheritance of relevant knowledge graph slices; (b) implements a structured delta-merge protocol for reconciling child-agent-generated knowledge back into the parent graph with confidence weighting; (c) maintains a per-agent confidence reputation score derived from historical merge acceptance rates, human confirmation rates, and contradiction rates; (d) tracks full generational lineage through a spawned-by graph enabling provenance tracing from any knowledge node back through its entire creation chain; (e) enforces generational depth limits with configurable confidence decay to prevent unbounded spawning and confidence inflation; (f) enables targeted rollback and quarantine of all knowledge contributed by a compromised or miscalibrated agent through lineage graph traversal; (g) implements Byzantine majority confidence boosting when multiple independent agents corroborate the same knowledge; and (h) supports personality inheritance with bounded drift, enabling child agents to adapt interest table weights to their task domain while constraining divergence from parent weights.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a system and method for managing pseudo-generational agent memory in multi-agent AI systems operating on shared confidence-scored knowledge graphs. The system comprises the following integrated subsystems:

**A Delta-Merge Protocol Engine** that computes the knowledge differential (delta) between a child agent's current graph state and its inherited graph slice upon task completion, proposes delta nodes for integration into the shared parent graph with confidence weights derived from the child agent's confidence reputation score, routes proposed nodes through an Evidence Validation Loop (EVL) based on confidence thresholds, and asynchronously updates the child agent's reputation based on merge outcomes.

**An Agent Confidence Reputation (ACR) Scoring System** that maintains a per-agent floating-point reputation score initialized at a configurable default value, updates the reputation based on the fraction of proposed delta nodes that survive EVL validation, the fraction that receive human confirmation, and the fraction that are later contradicted or rolled back, and feeds the reputation score back into the initial confidence assigned to the agent's future delta proposals, creating a self-regulating quality feedback loop.

**A Spawned-By Lineage Graph** that records parent-child relationships between agents as typed edges in the knowledge graph, records attribution edges linking each proposed knowledge node to the agent that proposed it, enables full provenance tracing from any node in the shared graph back through its entire generational creation chain, and enables targeted rollback by identifying and quarantining all nodes contributed by a compromised agent and its entire descendant subtree.

**A Generational Depth Limiter** that enforces a configurable maximum generational depth for agent spawning chains, applies confidence decay as a function of generational depth such that knowledge from deeper generations enters the shared graph at progressively lower confidence, and prevents unbounded confidence inflation through deep spawning chains.

**A Byzantine Majority Confidence Booster** that detects when three or more independent child agents propose semantically equivalent knowledge nodes, boosts the confidence of corroborated nodes based on the number of independent confirmations, and provides collective verification of agent-generated knowledge without requiring human intervention.

**A Personality Inheritance Engine** that propagates interest table weight vectors from parent agents to child agents at spawn time, enables bounded drift of interest weights based on the child agent's task domain, constrains drift magnitude to a configurable maximum deviation from parent weights, and optionally proposes significant drift deltas back to the parent agent for interest table evolution.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the overall topology of the pseudo-generational agent memory system, showing the relationships between the parent agent, child agent spawning, the shared knowledge graph, the delta-merge protocol engine, the ACR scoring system, the spawned-by lineage graph, and the generational depth limiter.

**FIG. 2** is a flowchart illustrating the delta-merge protocol execution flow, depicting the delta computation step, the per-node confidence weighting using the child agent's ACR score, the existing-node conflict resolution logic, the new-node insertion with confidence assignment, the EVL routing based on confidence thresholds, and the asynchronous ACR update based on merge outcomes.

**FIG. 3** is a data structure diagram illustrating the spawned-by lineage graph schema, showing the agent node structure (with agent_id, parent_agent_id, generation_depth, ACR score, spawn_time, and death_time fields), the spawned_by edge type, the proposed_by edge type linking knowledge nodes to their proposing agents, and the generational depth tracking.

**FIG. 4** is a state diagram illustrating the Agent Confidence Reputation (ACR) lifecycle, showing the initial state at default confidence (0.7), the reputation update transitions based on EVL acceptance, human confirmation, and contradiction events, the confidence bands (low: 0.0-0.5, medium: 0.5-0.8, high: 0.8-1.0), and the feedback path from ACR to delta-merge confidence weighting.

**FIG. 5** is a sequence diagram illustrating the full lifecycle of a child agent from spawning through task execution to death and delta-merge, showing the parent agent's spawn request, the knowledge slice inheritance, the child agent's autonomous knowledge accumulation, the task completion trigger, the delta computation, the merge proposal, the EVL/HCG processing, and the ACR update.

**FIG. 6** is a diagram illustrating the generational depth limit and confidence decay mechanism, showing a three-generation spawning chain (parent, child, grandchild) with the confidence decay formula applied at each generation, the depth limit enforcement, and the resulting confidence values for knowledge proposed at each generational level.

**FIG. 7** is a flowchart illustrating the targeted rollback and quarantine procedure, showing the identification of a compromised agent, the lineage graph traversal to identify all descendant agents, the collection of all knowledge nodes proposed by the compromised agent and its descendants, the quarantine flag application, and the optional re-validation path.

**FIG. 8** is a diagram illustrating the Byzantine majority confidence boosting mechanism, showing three independent child agents proposing semantically equivalent knowledge nodes, the semantic similarity detection process, the confidence aggregation formula, and the resulting boosted confidence score for the corroborated node.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 System Architecture Overview

Referring now to FIG. 1, the system of the present invention comprises a multi-agent orchestration platform (100) that manages a shared confidence-scored knowledge graph (200) stored in a persistent data store (210). The platform (100) supports a hierarchical agent topology in which a parent agent (300) may spawn one or more child agents (310a, 310b, 310c) for bounded tasks, and each child agent may in turn spawn grandchild agents (320a, 320b) subject to generational depth limits.

The platform (100) comprises the following integrated subsystems:

- A delta-merge protocol engine (400) that reconciles child agent knowledge back into the shared graph (200) upon child agent task completion;
- An agent confidence reputation (ACR) scoring system (500) that maintains and updates per-agent reputation scores;
- A spawned-by lineage graph (600) that records generational relationships and knowledge attribution;
- A generational depth limiter (700) that enforces maximum spawning depth and applies confidence decay;
- A Byzantine majority confidence booster (800) that detects and rewards independent knowledge corroboration;
- A personality inheritance engine (900) that propagates and constrains interest table weight vectors across generations;
- An evidence validation loop (EVL) (410) and human confirmation gateway (HCG) (420) as disclosed in the referenced SALUCA-015 application, which evaluate proposed knowledge nodes for validity and human approval.

In operation, the parent agent (300) initiates a child agent (310a) for a bounded task by invoking the spawning protocol. The generational depth limiter (700) verifies that the spawning depth does not exceed the configured maximum. The personality inheritance engine (900) propagates the parent's interest table weights to the child with optional task-domain drift. The parent agent (300) transmits a confidence-weighted graph slice -- a subset of the shared knowledge graph (200) relevant to the child's task -- to the child agent (310a). The child agent (310a) executes its task, accumulating new knowledge nodes and edges, and modifying confidence scores on inherited nodes. Upon task completion, the child agent (310a) invokes the delta-merge protocol engine (400), which computes the delta between the child's current graph state and the inherited slice, proposes delta nodes for merge into the shared graph (200) with confidence weights derived from the child's ACR score, and routes proposals through the EVL (410) and HCG (420) as appropriate. The ACR scoring system (500) asynchronously updates the child agent's reputation based on merge outcomes. The spawned-by lineage graph (600) records all generational relationships and knowledge attribution throughout this process.

### 7.2 Knowledge Graph Data Model

The shared knowledge graph (200) employs a property graph data model with the following node and edge schemas:

**7.2.1 Knowledge Node Schema**

```
KnowledgeNode {
    node_id: UUID,                    // Unique node identifier
    tenant_id: String,                // Tenant scope for RLS
    label: String,                    // Human-readable node label
    node_type: Enum,                  // ENTITY | CONCEPT | FACT | RELATION
    content: JSON,                    // Structured content payload
    confidence: Float,                // Current confidence score [0.0, 1.0]
    source_type: Enum,                // HUMAN | AUTONOMOUS | MERGED | CORROBORATED
    proposed_by_agent_id: UUID,       // Agent that proposed this node
    generation_depth: Integer,        // Generational depth of proposing agent
    original_confidence: Float,       // Confidence at time of insertion
    evl_status: Enum,                 // PENDING | VALIDATED | REJECTED | QUARANTINED
    hcg_status: Enum,                 // UNREVIEWED | CONFIRMED | DENIED
    quarantine_reason: String | None, // Reason for quarantine if applicable
    created_at: Timestamp,            // Node creation time
    updated_at: Timestamp,            // Last modification time
    hash: String                      // SHA-256 hash for integrity (per SALUCA-020)
}
```

**7.2.2 Knowledge Edge Schema**

```
KnowledgeEdge {
    edge_id: UUID,                    // Unique edge identifier
    tenant_id: String,                // Tenant scope for RLS
    source_node_id: UUID,             // Source node reference
    target_node_id: UUID,             // Target node reference
    edge_type: String,                // Relationship type label
    weight: Float,                    // Edge weight [0.0, 1.0]
    proposed_by_agent_id: UUID,       // Agent that proposed this edge
    confidence: Float,                // Edge confidence score
    created_at: Timestamp,
    hash: String                      // SHA-256 hash for integrity
}
```

**7.2.3 Agent Registry Schema**

```
AgentRecord {
    agent_id: UUID,                   // Unique agent identifier
    tenant_id: String,                // Tenant scope
    agent_name: String,               // Human-readable agent name
    agent_type: Enum,                 // PARENT | CHILD | GRANDCHILD
    parent_agent_id: UUID | None,     // Parent agent (None for root agents)
    generation_depth: Integer,        // 0 for root, 1 for child, 2 for grandchild, etc.
    acr_score: Float,                 // Current Agent Confidence Reputation [0.0, 1.0]
    acr_history: JSON,                // Array of historical ACR update events
    total_proposals: Integer,         // Total nodes proposed across all merges
    accepted_proposals: Integer,      // Nodes that survived EVL
    confirmed_proposals: Integer,     // Nodes that received HCG confirmation
    contradicted_proposals: Integer,  // Nodes later contradicted
    interest_weights: JSON,           // Interest table weight vector
    inherited_weights: JSON,          // Parent's weights at spawn time
    spawn_time: Timestamp,            // When this agent was spawned
    death_time: Timestamp | None,     // When this agent completed its task
    status: Enum,                     // ACTIVE | COMPLETED | QUARANTINED | TERMINATED
    task_description: String,         // Bounded task assignment
    inherited_slice_hash: String,     // Hash of the inherited graph slice
    created_at: Timestamp
}
```

### 7.3 Agent Confidence Reputation (ACR) Scoring System

Referring now to FIG. 4, the Agent Confidence Reputation scoring system (500) maintains a per-agent floating-point score that quantifies the historical quality of knowledge contributed by each agent. The ACR score directly influences the confidence assigned to the agent's future knowledge proposals, creating a self-regulating feedback loop.

**7.3.1 ACR Initialization**

When a new agent is created, its ACR score is initialized based on its generation depth and parent's ACR:

```
FUNCTION initialize_acr(agent, parent_agent, generation_depth):
    IF parent_agent IS NONE:
        // Root agent: initialize at system default
        agent.acr_score = ACR_DEFAULT  // Default: 0.7
    ELSE:
        // Child agent: inherit from parent with generational decay
        base_acr = parent_agent.acr_score
        decay_factor = ACR_GENERATIONAL_DECAY ^ generation_depth  // Default: 0.9^depth
        agent.acr_score = base_acr * decay_factor

    // Clamp to valid range
    agent.acr_score = CLAMP(agent.acr_score, ACR_MINIMUM, ACR_MAXIMUM)
    // ACR_MINIMUM = 0.1, ACR_MAXIMUM = 0.99

    agent.total_proposals = 0
    agent.accepted_proposals = 0
    agent.confirmed_proposals = 0
    agent.contradicted_proposals = 0

    RETURN agent
```

For example, a root parent agent starts at ACR = 0.7. A child agent (depth 1) of that parent starts at ACR = 0.7 * 0.9 = 0.63. A grandchild agent (depth 2) starts at ACR = 0.7 * 0.9^2 = 0.567. This decay ensures that deeper generations begin with appropriately lower trust.

**7.3.2 ACR Update Algorithm**

The ACR score is updated asynchronously after each delta-merge operation completes EVL and optional HCG processing:

```
FUNCTION update_acr(agent, merge_results):
    // merge_results contains the outcome of each proposed node
    FOR EACH result IN merge_results:
        agent.total_proposals += 1

        IF result.evl_status == VALIDATED:
            agent.accepted_proposals += 1
        ELSE IF result.evl_status == REJECTED:
            // No change to accepted count
            PASS

        IF result.hcg_status == CONFIRMED:
            agent.confirmed_proposals += 1

        IF result.contradicted == TRUE:
            agent.contradicted_proposals += 1

    // Compute component scores
    IF agent.total_proposals == 0:
        RETURN  // No update possible

    acceptance_rate = agent.accepted_proposals / agent.total_proposals
    confirmation_rate = agent.confirmed_proposals / MAX(agent.accepted_proposals, 1)
    contradiction_rate = agent.contradicted_proposals / agent.total_proposals

    // Weighted composite score
    // acceptance_rate: how often the agent's knowledge passes EVL (weight: 0.5)
    // confirmation_rate: how often accepted knowledge gets human confirmation (weight: 0.3)
    // contradiction_rate: how often the agent's knowledge is later contradicted (weight: 0.2, inverted)
    raw_acr = (
        ACR_WEIGHT_ACCEPTANCE * acceptance_rate +          // 0.5
        ACR_WEIGHT_CONFIRMATION * confirmation_rate +      // 0.3
        ACR_WEIGHT_CONTRADICTION * (1.0 - contradiction_rate)  // 0.2
    )

    // Exponential moving average to smooth updates
    // SMOOTHING_FACTOR controls how quickly ACR adapts (default: 0.3)
    agent.acr_score = (
        (1.0 - ACR_SMOOTHING_FACTOR) * agent.acr_score +
        ACR_SMOOTHING_FACTOR * raw_acr
    )

    // Clamp to valid range
    agent.acr_score = CLAMP(agent.acr_score, ACR_MINIMUM, ACR_MAXIMUM)

    // Record update event in history
    agent.acr_history.APPEND({
        timestamp: CURRENT_TIME(),
        previous_acr: previous_value,
        new_acr: agent.acr_score,
        acceptance_rate: acceptance_rate,
        confirmation_rate: confirmation_rate,
        contradiction_rate: contradiction_rate,
        merge_batch_size: LENGTH(merge_results)
    })

    PERSIST(agent)
```

**7.3.3 ACR Confidence Bands**

The system defines three confidence bands that determine how the agent's proposals are processed:

```
ACR Confidence Bands:
    LOW:    0.0 <= ACR < 0.5   -> All proposals require HCG confirmation
    MEDIUM: 0.5 <= ACR < 0.8   -> Proposals above 0.85 confidence go to EVL;
                                   below 0.85 queue for next scheduled EVL pass
    HIGH:   0.8 <= ACR <= 1.0  -> Proposals may be accepted at autonomous
                                   confidence without immediate EVL if above
                                   ACR-derived threshold
```

These bands ensure that untrusted or new agents have their knowledge rigorously validated, while highly accurate agents experience reduced friction, accelerating knowledge integration without sacrificing quality.

**7.3.4 ACR Decay Over Time**

To prevent stale reputation from persisting indefinitely, the ACR score undergoes time-based decay when an agent is inactive:

```
FUNCTION apply_acr_time_decay(agent, current_time):
    IF agent.status != ACTIVE:
        RETURN

    time_since_last_merge = current_time - agent.last_merge_time
    IF time_since_last_merge > ACR_DECAY_WINDOW:  // Default: 7 days
        decay_periods = FLOOR(time_since_last_merge / ACR_DECAY_WINDOW)
        decay_amount = decay_periods * ACR_TIME_DECAY_RATE  // Default: 0.02 per period
        agent.acr_score = MAX(
            ACR_MINIMUM,
            agent.acr_score - decay_amount
        )
        PERSIST(agent)
```

### 7.4 Delta-Merge Protocol Engine

Referring now to FIG. 2, the delta-merge protocol engine (400) implements the core reconciliation mechanism by which child agent knowledge is integrated into the shared parent graph.

**7.4.1 Graph Slice Inheritance**

When a parent agent spawns a child agent, the child receives a confidence-weighted graph slice relevant to its task:

```
FUNCTION create_graph_slice(parent_agent, task_description, shared_graph):
    // Step 1: Identify relevant nodes using interest table weights
    relevant_nodes = []
    FOR EACH node IN shared_graph.nodes:
        relevance_score = COMPUTE_RELEVANCE(node, task_description, parent_agent.interest_weights)
        IF relevance_score >= SLICE_RELEVANCE_THRESHOLD:  // Default: 0.3
            relevant_nodes.APPEND(node)

    // Step 2: Include edges between relevant nodes
    relevant_edges = []
    relevant_node_ids = SET([n.node_id FOR n IN relevant_nodes])
    FOR EACH edge IN shared_graph.edges:
        IF edge.source_node_id IN relevant_node_ids AND edge.target_node_id IN relevant_node_ids:
            relevant_edges.APPEND(edge)

    // Step 3: Create immutable snapshot
    slice = GraphSlice {
        slice_id: GENERATE_UUID(),
        parent_agent_id: parent_agent.agent_id,
        nodes: DEEP_COPY(relevant_nodes),
        edges: DEEP_COPY(relevant_edges),
        slice_hash: SHA256(CANONICAL_SERIALIZE(relevant_nodes, relevant_edges)),
        created_at: CURRENT_TIME()
    }

    RETURN slice
```

The graph slice is an immutable snapshot. The child agent receives a deep copy, ensuring that the child's modifications do not directly affect the shared graph until the delta-merge protocol is executed.

**7.4.2 Delta Computation**

Upon child agent task completion ("death"), the delta-merge protocol engine computes the knowledge differential:

```
FUNCTION compute_delta(child_agent, inherited_slice):
    current_state = child_agent.graph_state
    delta = DeltaSet {
        new_nodes: [],          // Nodes in current_state but not in inherited_slice
        modified_nodes: [],     // Nodes in both but with changed confidence or content
        new_edges: [],          // Edges in current_state but not in inherited_slice
        modified_edges: [],     // Edges in both but with changed weight or attributes
        deleted_node_ids: [],   // Nodes in inherited_slice but not in current_state
        deleted_edge_ids: []    // Edges in inherited_slice but not in current_state
    }

    inherited_node_ids = SET([n.node_id FOR n IN inherited_slice.nodes])
    current_node_ids = SET([n.node_id FOR n IN current_state.nodes])

    // Identify new nodes
    FOR EACH node IN current_state.nodes:
        IF node.node_id NOT IN inherited_node_ids:
            delta.new_nodes.APPEND(node)

    // Identify modified nodes
    FOR EACH node IN current_state.nodes:
        IF node.node_id IN inherited_node_ids:
            inherited_node = GET_NODE(inherited_slice, node.node_id)
            IF node.confidence != inherited_node.confidence OR
               node.content != inherited_node.content:
                delta.modified_nodes.APPEND({
                    node_id: node.node_id,
                    old_confidence: inherited_node.confidence,
                    new_confidence: node.confidence,
                    old_content: inherited_node.content,
                    new_content: node.content
                })

    // Identify deleted nodes
    FOR EACH node_id IN inherited_node_ids:
        IF node_id NOT IN current_node_ids:
            delta.deleted_node_ids.APPEND(node_id)

    // Analogous computation for edges (omitted for brevity; same pattern)
    // ...

    delta.delta_hash = SHA256(CANONICAL_SERIALIZE(delta))

    RETURN delta
```

**7.4.3 Confidence-Weighted Merge Execution**

The merge execution applies the child agent's ACR score to weight the confidence of proposed knowledge:

```
FUNCTION execute_merge(child_agent, delta, shared_graph):
    acr = child_agent.acr_score
    merge_results = []

    // Process new nodes
    FOR EACH node IN delta.new_nodes:
        // Check for semantic duplicates in shared graph
        existing_match = FIND_SEMANTIC_MATCH(node, shared_graph)

        IF existing_match IS NOT NONE:
            // Node semantically exists -- treat as confidence update
            proposed_confidence = MAX(existing_match.confidence, node.confidence * acr)
            IF proposed_confidence > existing_match.confidence + CONFIDENCE_UPDATE_THRESHOLD:
                // Significant confidence increase -- flag for EVL review
                merge_result = PROPOSE_CONFIDENCE_UPDATE(
                    existing_node = existing_match,
                    proposed_confidence = proposed_confidence,
                    proposing_agent = child_agent
                )
            ELSE:
                // Minor change -- skip
                merge_result = MergeResult(status=SKIPPED, node_id=existing_match.node_id)
        ELSE:
            // Genuinely new node
            insertion_confidence = node.confidence * acr
            new_node = CREATE_GRAPH_NODE(
                content = node.content,
                label = node.label,
                confidence = insertion_confidence,
                source_type = AUTONOMOUS,
                proposed_by_agent_id = child_agent.agent_id,
                generation_depth = child_agent.generation_depth,
                original_confidence = insertion_confidence
            )

            // Route based on confidence
            IF insertion_confidence >= EVL_IMMEDIATE_THRESHOLD:  // Default: 0.85
                SUBMIT_TO_EVL_IMMEDIATE(new_node)
                merge_result = MergeResult(status=EVL_PENDING, node_id=new_node.node_id)
            ELSE:
                QUEUE_FOR_SCHEDULED_EVL(new_node)
                merge_result = MergeResult(status=EVL_QUEUED, node_id=new_node.node_id)

            // Record attribution in lineage graph
            CREATE_PROPOSED_BY_EDGE(new_node.node_id, child_agent.agent_id)

        merge_results.APPEND(merge_result)

    // Process modified nodes
    FOR EACH modification IN delta.modified_nodes:
        existing_node = GET_NODE(shared_graph, modification.node_id)
        proposed_confidence = MAX(
            existing_node.confidence,
            modification.new_confidence * acr
        )

        IF proposed_confidence > existing_node.confidence + CONFIDENCE_UPDATE_THRESHOLD:
            merge_result = PROPOSE_CONFIDENCE_UPDATE(
                existing_node = existing_node,
                proposed_confidence = proposed_confidence,
                proposing_agent = child_agent
            )
        ELSE:
            merge_result = MergeResult(status=SKIPPED, node_id=modification.node_id)

        merge_results.APPEND(merge_result)

    // Process deletions (treated as confidence reduction proposals, not hard deletes)
    FOR EACH node_id IN delta.deleted_node_ids:
        existing_node = GET_NODE(shared_graph, node_id)
        IF existing_node IS NOT NONE:
            // Child agent's deletion is a signal to reduce confidence, not remove
            proposed_confidence = existing_node.confidence * (1.0 - acr * DELETION_WEIGHT)
            merge_result = PROPOSE_CONFIDENCE_UPDATE(
                existing_node = existing_node,
                proposed_confidence = proposed_confidence,
                proposing_agent = child_agent,
                reason = "CHILD_DELETION_SIGNAL"
            )
            merge_results.APPEND(merge_result)

    // Asynchronous ACR update after EVL/HCG processing completes
    SCHEDULE_ACR_UPDATE(child_agent.agent_id, merge_results)

    RETURN merge_results
```

**7.4.4 Semantic Match Detection**

The semantic match detection determines whether a proposed node is semantically equivalent to an existing node in the shared graph:

```
FUNCTION find_semantic_match(proposed_node, shared_graph):
    // Strategy 1: Exact label match
    exact_matches = [n FOR n IN shared_graph.nodes
                     WHERE n.label == proposed_node.label
                     AND n.node_type == proposed_node.node_type]
    IF LENGTH(exact_matches) == 1:
        RETURN exact_matches[0]

    // Strategy 2: Embedding-based semantic similarity
    proposed_embedding = COMPUTE_EMBEDDING(proposed_node.content)
    best_match = NONE
    best_similarity = 0.0

    FOR EACH node IN shared_graph.nodes:
        IF node.node_type == proposed_node.node_type:
            similarity = COSINE_SIMILARITY(proposed_embedding, node.embedding)
            IF similarity > best_similarity:
                best_similarity = similarity
                best_match = node

    IF best_similarity >= SEMANTIC_MATCH_THRESHOLD:  // Default: 0.92
        RETURN best_match

    RETURN NONE  // No semantic match found
```

The two-strategy approach ensures both exact duplicate detection and fuzzy semantic matching. The high default threshold (0.92) minimizes false-positive merges while still catching paraphrased or reformulated duplicates.

### 7.5 Spawned-By Lineage Graph

Referring now to FIG. 3, the spawned-by lineage graph (600) is a directed acyclic graph (DAG) that records all generational relationships between agents and all attribution relationships between knowledge nodes and their proposing agents.

**7.5.1 Lineage Edge Types**

The lineage graph comprises two primary edge types:

```
LineageEdge (spawned_by) {
    edge_id: UUID,
    child_agent_id: UUID,       // Source: child agent
    parent_agent_id: UUID,      // Target: parent agent
    edge_type: "spawned_by",
    generation_depth: Integer,  // Child's generation depth
    spawn_time: Timestamp,
    task_description: String,   // The bounded task assigned to the child
    inherited_slice_hash: String  // Hash of the graph slice inherited by child
}

AttributionEdge (proposed_by) {
    edge_id: UUID,
    node_id: UUID,              // Source: knowledge node
    agent_id: UUID,             // Target: proposing agent
    edge_type: "proposed_by",
    proposal_time: Timestamp,
    original_confidence: Float, // Confidence at time of proposal
    merge_status: Enum,         // PENDING | ACCEPTED | REJECTED | QUARANTINED
    evl_outcome: Enum | None,
    hcg_outcome: Enum | None
}
```

**7.5.2 Lineage Traversal Algorithms**

The lineage graph supports several traversal operations critical to the system's provenance and security capabilities:

```
FUNCTION get_full_lineage(agent_id, lineage_graph):
    // Returns the complete ancestry chain from agent back to root
    lineage = []
    current = agent_id

    WHILE current IS NOT NONE:
        agent = GET_AGENT(current)
        lineage.APPEND(agent)
        current = agent.parent_agent_id

    RETURN REVERSE(lineage)  // Root first, agent last


FUNCTION get_all_descendants(agent_id, lineage_graph):
    // Returns all descendants (children, grandchildren, etc.) of an agent
    descendants = []
    queue = [agent_id]

    WHILE queue IS NOT EMPTY:
        current = queue.POP_FRONT()
        children = GET_CHILDREN(current, lineage_graph)
        FOR EACH child IN children:
            descendants.APPEND(child)
            queue.APPEND(child.agent_id)

    RETURN descendants


FUNCTION get_all_contributed_nodes(agent_id, lineage_graph):
    // Returns all knowledge nodes proposed by this agent
    attribution_edges = [e FOR e IN lineage_graph.edges
                         WHERE e.edge_type == "proposed_by"
                         AND e.agent_id == agent_id]
    RETURN [GET_NODE(e.node_id) FOR e IN attribution_edges]
```

**7.5.3 Provenance Query**

Any knowledge node in the shared graph can be traced back through its entire creation chain:

```
FUNCTION trace_provenance(node_id, shared_graph, lineage_graph):
    // Step 1: Find the proposing agent
    attribution = GET_ATTRIBUTION_EDGE(node_id, lineage_graph)
    proposing_agent = GET_AGENT(attribution.agent_id)

    // Step 2: Get the full lineage of the proposing agent
    agent_lineage = get_full_lineage(proposing_agent.agent_id, lineage_graph)

    // Step 3: Construct provenance record
    provenance = ProvenanceRecord {
        node_id: node_id,
        proposing_agent_id: proposing_agent.agent_id,
        proposing_agent_acr: proposing_agent.acr_score,
        generation_depth: proposing_agent.generation_depth,
        proposal_time: attribution.proposal_time,
        original_confidence: attribution.original_confidence,
        current_confidence: GET_NODE(node_id).confidence,
        merge_status: attribution.merge_status,
        agent_lineage: agent_lineage,  // Full chain from root to proposer
        lineage_acr_chain: [a.acr_score FOR a IN agent_lineage]
    }

    RETURN provenance
```

### 7.6 Generational Depth Limiter

Referring now to FIG. 6, the generational depth limiter (700) enforces bounds on the hierarchical depth of agent spawning chains and applies confidence decay to knowledge originating from deeper generations.

**7.6.1 Depth Enforcement**

```
FUNCTION enforce_depth_limit(parent_agent, spawn_request):
    child_depth = parent_agent.generation_depth + 1

    IF child_depth > MAX_GENERATION_DEPTH:  // Default: 3
        RAISE GenerationalDepthExceeded(
            parent_agent_id = parent_agent.agent_id,
            parent_depth = parent_agent.generation_depth,
            requested_child_depth = child_depth,
            max_depth = MAX_GENERATION_DEPTH,
            message = "Cannot spawn child: generational depth limit exceeded"
        )

    RETURN child_depth
```

**7.6.2 Confidence Decay Formula**

Knowledge proposed by agents at greater generational depth enters the shared graph at progressively lower confidence:

```
FUNCTION compute_generational_confidence(base_confidence, agent_acr, generation_depth):
    // Confidence = base_confidence * ACR * decay^depth
    decay_factor = GENERATIONAL_DECAY_RATE ^ generation_depth  // Default: 0.9^depth
    effective_confidence = base_confidence * agent_acr * decay_factor

    // Ensure minimum confidence floor
    effective_confidence = MAX(effective_confidence, MINIMUM_CONFIDENCE)  // Default: 0.05

    RETURN effective_confidence
```

The decay formula produces the following confidence values for a node with base confidence 1.0 proposed by agents at various depths, assuming default ACR of 0.7:

```
Depth 0 (root):        1.0 * 0.7 * 0.9^0 = 0.700
Depth 1 (child):       1.0 * 0.63 * 0.9^1 = 0.567
Depth 2 (grandchild):  1.0 * 0.567 * 0.9^2 = 0.459
Depth 3 (great-grand): 1.0 * 0.510 * 0.9^3 = 0.372
```

This decay prevents a deep spawning chain from collectively inflating confidence through repeated autonomous extraction. Knowledge from deep generations must earn confidence through EVL validation and human confirmation, regardless of the number of agents in the chain.

### 7.7 Targeted Rollback and Quarantine

Referring now to FIG. 7, the targeted rollback mechanism leverages the spawned-by lineage graph to quarantine all knowledge contributed by a compromised or miscalibrated agent and its entire descendant subtree.

**7.7.1 Quarantine Procedure**

```
FUNCTION quarantine_agent_subtree(compromised_agent_id, reason, lineage_graph, shared_graph):
    // Step 1: Get the compromised agent and all its descendants
    compromised_agent = GET_AGENT(compromised_agent_id)
    descendants = get_all_descendants(compromised_agent_id, lineage_graph)
    affected_agents = [compromised_agent] + descendants

    quarantine_record = QuarantineRecord {
        quarantine_id: GENERATE_UUID(),
        trigger_agent_id: compromised_agent_id,
        reason: reason,
        initiated_at: CURRENT_TIME(),
        affected_agents: [],
        affected_nodes: [],
        affected_edges: []
    }

    // Step 2: For each affected agent, quarantine all contributed nodes
    FOR EACH agent IN affected_agents:
        agent.status = QUARANTINED
        contributed_nodes = get_all_contributed_nodes(agent.agent_id, lineage_graph)

        FOR EACH node IN contributed_nodes:
            // Store original state for potential restoration
            quarantine_record.affected_nodes.APPEND({
                node_id: node.node_id,
                previous_confidence: node.confidence,
                previous_evl_status: node.evl_status,
                previous_hcg_status: node.hcg_status
            })

            // Apply quarantine
            node.evl_status = QUARANTINED
            node.quarantine_reason = FORMAT(
                "Agent {agent_id} quarantined: {reason}. "
                "Lineage chain: {lineage}",
                agent_id = agent.agent_id,
                reason = reason,
                lineage = get_full_lineage(agent.agent_id, lineage_graph)
            )
            node.confidence = QUARANTINE_CONFIDENCE  // Default: 0.0
            PERSIST(node)

        quarantine_record.affected_agents.APPEND({
            agent_id: agent.agent_id,
            generation_depth: agent.generation_depth,
            nodes_quarantined: LENGTH(contributed_nodes)
        })

    // Step 3: Log quarantine event (per SALUCA-020 hash chain)
    LOG_QUARANTINE_EVENT(quarantine_record)

    RETURN quarantine_record
```

**7.7.2 Selective Restoration**

Quarantined nodes may be selectively restored after investigation:

```
FUNCTION restore_from_quarantine(quarantine_id, node_ids_to_restore, reviewer_id):
    quarantine_record = GET_QUARANTINE_RECORD(quarantine_id)

    FOR EACH node_id IN node_ids_to_restore:
        original_state = FIND_IN(quarantine_record.affected_nodes, node_id)
        node = GET_NODE(node_id)

        // Restore to pre-quarantine state but require HCG re-confirmation
        node.confidence = original_state.previous_confidence
        node.evl_status = VALIDATED  // Considered validated by restoration
        node.hcg_status = UNREVIEWED  // Require fresh human confirmation
        node.quarantine_reason = NONE

        PERSIST(node)

    LOG_RESTORATION_EVENT(quarantine_id, node_ids_to_restore, reviewer_id)
```

### 7.8 Byzantine Majority Confidence Boosting

Referring now to FIG. 8, the Byzantine majority confidence booster (800) detects when multiple independent child agents propose semantically equivalent knowledge nodes, and boosts confidence based on independent corroboration.

**7.8.1 Independence Verification**

For corroboration to be valid, the proposing agents must be independent -- they must not share a parent-child relationship within two generations:

```
FUNCTION verify_independence(agent_ids, lineage_graph):
    // Two agents are independent if neither is an ancestor/descendant of the other
    // within 2 generations
    FOR EACH pair (agent_a, agent_b) IN COMBINATIONS(agent_ids, 2):
        lineage_a = get_full_lineage(agent_a, lineage_graph)
        lineage_b = get_full_lineage(agent_b, lineage_graph)

        lineage_a_ids = SET([a.agent_id FOR a IN lineage_a])
        lineage_b_ids = SET([a.agent_id FOR a IN lineage_b])

        // Check if one is in the other's lineage (within 2 generations)
        IF agent_a IN lineage_b_ids[-2:] OR agent_b IN lineage_a_ids[-2:]:
            RETURN FALSE  // Not independent

    RETURN TRUE
```

**7.8.2 Corroboration Detection and Confidence Boosting**

```
FUNCTION detect_and_boost_corroboration(pending_proposals, shared_graph, lineage_graph):
    // Group proposals by semantic similarity
    similarity_groups = CLUSTER_BY_SEMANTIC_SIMILARITY(
        pending_proposals,
        threshold = CORROBORATION_SIMILARITY_THRESHOLD  // Default: 0.90
    )

    FOR EACH group IN similarity_groups:
        IF LENGTH(group.proposals) >= BYZANTINE_MINIMUM:  // Default: 3
            proposing_agents = [p.proposing_agent_id FOR p IN group.proposals]

            IF verify_independence(proposing_agents, lineage_graph):
                // Compute boosted confidence
                individual_confidences = [p.proposed_confidence FOR p IN group.proposals]
                base_confidence = MAX(individual_confidences)

                // Boost formula: base + (1 - base) * (1 - 1/(n-1))
                // where n = number of independent confirmations
                n = LENGTH(group.proposals)
                boost = (1.0 - base_confidence) * (1.0 - 1.0 / (n - 1))
                boosted_confidence = MIN(base_confidence + boost, CORROBORATION_MAX)
                // CORROBORATION_MAX = 0.98

                // Create or update the corroborated node
                representative_node = group.proposals[0].node
                representative_node.confidence = boosted_confidence
                representative_node.source_type = CORROBORATED

                // Record all contributing agents
                FOR EACH proposal IN group.proposals:
                    CREATE_PROPOSED_BY_EDGE(
                        representative_node.node_id,
                        proposal.proposing_agent_id
                    )

                // Corroborated nodes bypass EVL queue -- go directly to validated
                representative_node.evl_status = VALIDATED
                PERSIST(representative_node)

                // Boost ACR for all contributing agents
                FOR EACH agent_id IN proposing_agents:
                    agent = GET_AGENT(agent_id)
                    agent.acr_score = MIN(
                        agent.acr_score + CORROBORATION_ACR_BONUS,  // Default: 0.05
                        ACR_MAXIMUM
                    )
                    PERSIST(agent)
```

The Byzantine majority mechanism provides a path for knowledge to achieve high confidence without human intervention, but only when multiple independent agents converge on the same conclusion. The independence verification prevents a single compromised agent from spawning children to artificially corroborate its own knowledge.

### 7.9 Personality Inheritance with Bounded Drift

The personality inheritance engine (900) propagates interest table weight vectors from parent agents to child agents and manages bounded drift during the child's lifetime.

**7.9.1 Interest Table Weight Inheritance**

```
FUNCTION inherit_interest_weights(parent_agent, child_agent, task_description):
    // Deep copy parent weights
    child_agent.inherited_weights = DEEP_COPY(parent_agent.interest_weights)
    child_agent.interest_weights = DEEP_COPY(parent_agent.interest_weights)

    // Apply task-domain bias
    task_domain = CLASSIFY_TASK_DOMAIN(task_description)
    domain_bias = GET_DOMAIN_BIAS_VECTOR(task_domain)
    // domain_bias is a sparse vector with small positive values for
    // relevant interest categories

    FOR EACH category IN child_agent.interest_weights:
        IF category IN domain_bias:
            child_agent.interest_weights[category] += domain_bias[category]
            // Clamp to [0.0, 1.0]
            child_agent.interest_weights[category] = CLAMP(
                child_agent.interest_weights[category], 0.0, 1.0
            )

    PERSIST(child_agent)
```

**7.9.2 Bounded Drift Enforcement**

During the child agent's lifetime, its interest weights may drift based on encountered content, but drift is bounded:

```
FUNCTION enforce_drift_bound(child_agent):
    FOR EACH category IN child_agent.interest_weights:
        inherited_value = child_agent.inherited_weights[category]
        current_value = child_agent.interest_weights[category]
        drift = current_value - inherited_value

        IF ABS(drift) > MAX_DRIFT_MAGNITUDE:  // Default: 0.2
            // Clamp drift to maximum magnitude
            clamped_value = inherited_value + SIGN(drift) * MAX_DRIFT_MAGNITUDE
            child_agent.interest_weights[category] = clamped_value

    PERSIST(child_agent)
```

**7.9.3 Drift Proposal Back to Parent**

If a child agent's drift is significant and the child has a high ACR score, the drift is proposed back to the parent:

```
FUNCTION propose_drift_to_parent(child_agent, parent_agent):
    IF child_agent.acr_score < DRIFT_PROPOSAL_ACR_THRESHOLD:  // Default: 0.75
        RETURN  // Only high-reputation children can propose drift

    drift_vector = {}
    significant_drift = FALSE

    FOR EACH category IN child_agent.interest_weights:
        drift = child_agent.interest_weights[category] - child_agent.inherited_weights[category]
        IF ABS(drift) >= SIGNIFICANT_DRIFT_THRESHOLD:  // Default: 0.1
            drift_vector[category] = drift
            significant_drift = TRUE

    IF significant_drift:
        // Apply attenuated drift to parent
        // Attenuation factor based on child ACR
        attenuation = child_agent.acr_score * DRIFT_ATTENUATION  // Default: 0.5
        FOR EACH category, drift IN drift_vector:
            parent_agent.interest_weights[category] += drift * attenuation
            parent_agent.interest_weights[category] = CLAMP(
                parent_agent.interest_weights[category], 0.0, 1.0
            )

        PERSIST(parent_agent)

        LOG_DRIFT_PROPOSAL({
            child_agent_id: child_agent.agent_id,
            parent_agent_id: parent_agent.agent_id,
            drift_vector: drift_vector,
            attenuation: attenuation,
            child_acr: child_agent.acr_score
        })
```

This mechanism enables parents to evolve their interest profiles through the cumulative experience of their children, mimicking biological generational learning. The attenuation ensures that no single child can dramatically reshape the parent's interests, and the ACR threshold ensures that only reliably accurate children influence parent evolution.

### 7.10 Agent Spawning Lifecycle

Referring now to FIG. 5, the complete lifecycle of a child agent proceeds through the following phases:

**7.10.1 Spawn Phase**

```
FUNCTION spawn_child_agent(parent_agent, task_description, shared_graph, lineage_graph):
    // Step 1: Enforce generational depth limit
    child_depth = enforce_depth_limit(parent_agent, task_description)

    // Step 2: Create child agent record
    child_agent = AgentRecord {
        agent_id: GENERATE_UUID(),
        tenant_id: parent_agent.tenant_id,
        agent_name: FORMAT("{parent_name}::child::{task_hash}",
                          parent_name = parent_agent.agent_name,
                          task_hash = SHA256(task_description)[:8]),
        agent_type: AGENT_TYPE_FOR_DEPTH(child_depth),
        parent_agent_id: parent_agent.agent_id,
        generation_depth: child_depth,
        task_description: task_description,
        spawn_time: CURRENT_TIME(),
        death_time: NONE,
        status: ACTIVE
    }

    // Step 3: Initialize ACR
    initialize_acr(child_agent, parent_agent, child_depth)

    // Step 4: Inherit interest weights
    inherit_interest_weights(parent_agent, child_agent, task_description)

    // Step 5: Create and assign graph slice
    graph_slice = create_graph_slice(parent_agent, task_description, shared_graph)
    child_agent.graph_state = graph_slice.nodes + graph_slice.edges
    child_agent.inherited_slice = graph_slice
    child_agent.inherited_slice_hash = graph_slice.slice_hash

    // Step 6: Record lineage
    CREATE_LINEAGE_EDGE(LineageEdge {
        child_agent_id: child_agent.agent_id,
        parent_agent_id: parent_agent.agent_id,
        edge_type: "spawned_by",
        generation_depth: child_depth,
        spawn_time: CURRENT_TIME(),
        task_description: task_description,
        inherited_slice_hash: graph_slice.slice_hash
    })

    PERSIST(child_agent)

    RETURN child_agent
```

**7.10.2 Execution Phase**

During the execution phase, the child agent operates autonomously on its task, accumulating new knowledge nodes and edges and modifying confidence scores on inherited nodes. The child's operations are bounded by its graph slice and task description.

**7.10.3 Death and Merge Phase**

```
FUNCTION close_child_agent(child_agent, shared_graph, lineage_graph):
    // Step 1: Mark agent as completing
    child_agent.death_time = CURRENT_TIME()

    // Step 2: Enforce drift bounds one final time
    enforce_drift_bound(child_agent)

    // Step 3: Compute delta
    delta = compute_delta(child_agent, child_agent.inherited_slice)

    // Step 4: Execute merge
    merge_results = execute_merge(child_agent, delta, shared_graph)

    // Step 5: Propose drift to parent (if significant and high ACR)
    parent_agent = GET_AGENT(child_agent.parent_agent_id)
    propose_drift_to_parent(child_agent, parent_agent)

    // Step 6: Check for Byzantine majority corroboration
    pending_proposals = GET_PENDING_PROPOSALS(shared_graph)
    detect_and_boost_corroboration(pending_proposals, shared_graph, lineage_graph)

    // Step 7: Update agent status
    child_agent.status = COMPLETED
    PERSIST(child_agent)

    // Step 8: Log lifecycle event (per SALUCA-020 hash chain)
    LOG_AGENT_LIFECYCLE_EVENT({
        event_type: "AGENT_DEATH_AND_MERGE",
        agent_id: child_agent.agent_id,
        parent_agent_id: child_agent.parent_agent_id,
        generation_depth: child_agent.generation_depth,
        delta_size: LENGTH(delta.new_nodes) + LENGTH(delta.modified_nodes),
        merge_results_summary: SUMMARIZE(merge_results),
        acr_at_death: child_agent.acr_score,
        lifetime_seconds: (child_agent.death_time - child_agent.spawn_time).total_seconds()
    })

    RETURN merge_results
```

### 7.11 Cross-Organization Federation (Enterprise Extension)

In an enterprise deployment, the system supports cross-organization participation in shared knowledge graphs with tenant-scoped access controls:

```
FederationPolicy {
    federation_id: UUID,
    participating_tenants: List[String],
    shared_graph_id: UUID,
    rls_policy: Enum,               // FULL_ACCESS | READ_ONLY | WRITE_WITH_REVIEW
    acr_floor: Float,               // Minimum ACR for cross-tenant contributions
    require_hcg_for_cross_tenant: Boolean,  // Require human confirmation for cross-org nodes
    max_generation_depth_cross_tenant: Integer  // Depth limit for cross-tenant agents
}
```

Cross-organization agents operate under stricter ACR requirements and may be subject to mandatory HCG review, regardless of their ACR score, to prevent knowledge contamination across organizational boundaries.

### 7.12 Hash-Chain Integration

All delta-merge operations, ACR updates, quarantine events, and agent lifecycle events are recorded in the hash-chained audit log as disclosed in the referenced SALUCA-020 application. Each event includes:

```
AuditEntry {
    entry_id: UUID,
    previous_hash: String,          // Hash of previous entry in chain
    entry_hash: String,             // SHA-256 of this entry's content
    event_type: String,             // MERGE | ACR_UPDATE | QUARANTINE | SPAWN | DEATH
    agent_id: UUID,
    tenant_id: String,
    payload: JSON,                  // Event-specific data
    timestamp: Timestamp
}
```

The hash chain provides tamper-evident logging, ensuring that any modification to historical merge decisions, ACR scores, or quarantine events is detectable through hash chain verification.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented method for managing knowledge propagation in a multi-agent artificial intelligence system, the method comprising:

(a) maintaining, by a computing system, a shared knowledge graph comprising a plurality of knowledge nodes, each knowledge node having an associated confidence score;

(b) maintaining, by the computing system, an agent confidence reputation (ACR) score for each agent in the system, the ACR score being a floating-point value derived from the agent's historical merge acceptance rate, human confirmation rate, and contradiction rate;

(c) spawning, by a parent agent, a child agent for a bounded task, the spawning comprising transmitting a confidence-weighted graph slice of the shared knowledge graph to the child agent;

(d) upon completion of the bounded task by the child agent, computing a delta between the child agent's current graph state and the inherited graph slice, the delta comprising new knowledge nodes, modified knowledge nodes, and deleted knowledge node indicators;

(e) executing a confidence-weighted merge of the delta into the shared knowledge graph, wherein the confidence assigned to each proposed knowledge node is weighted by the child agent's ACR score; and

(f) asynchronously updating the child agent's ACR score based on the outcomes of the merge, including whether proposed nodes were validated, confirmed by a human reviewer, or subsequently contradicted.

**Claim 2.** The method of Claim 1, further comprising recording, in a spawned-by lineage graph, a directed edge from the child agent to the parent agent, and recording, for each proposed knowledge node, a directed attribution edge from the knowledge node to the proposing child agent, thereby enabling provenance tracing from any knowledge node in the shared knowledge graph back through the entire generational chain of agents that created it.

**Claim 3.** The method of Claim 2, further comprising, upon determining that a particular agent is compromised or miscalibrated:

(a) traversing the spawned-by lineage graph to identify all descendant agents of the particular agent;

(b) for each of the particular agent and each descendant agent, identifying all knowledge nodes attributed to that agent via the attribution edges; and

(c) quarantining all identified knowledge nodes by setting their confidence scores to a quarantine value and marking their validation status as quarantined.

**Claim 4.** The method of Claim 1, further comprising enforcing a generational depth limit by:

(a) tracking the generation depth of each agent, wherein the parent agent has generation depth zero and each child agent has generation depth one greater than its parent;

(b) refusing to spawn a child agent when the resulting generation depth would exceed a configurable maximum generation depth; and

(c) applying a confidence decay factor as a function of generation depth, such that knowledge proposed by agents at greater generational depth enters the shared knowledge graph at progressively lower confidence according to the formula: effective_confidence = base_confidence x ACR x decay_rate^depth.

**Claim 5.** The method of Claim 1, wherein the ACR score is initialized for a new agent based on the parent agent's ACR score multiplied by a generational decay factor raised to the power of the generation depth, and wherein the ACR score is updated using an exponential moving average of a weighted composite of the acceptance rate, the confirmation rate, and the inverse contradiction rate.

**Claim 6.** The method of Claim 1, wherein executing the confidence-weighted merge further comprises, for each proposed knowledge node:

(a) determining whether a semantically equivalent node exists in the shared knowledge graph using embedding-based cosine similarity with a configurable similarity threshold;

(b) if a semantically equivalent node exists, proposing a confidence update to the existing node only if the proposed confidence exceeds the existing confidence by more than a configurable update threshold; and

(c) if no semantically equivalent node exists, inserting the proposed node with a confidence equal to the node's base confidence multiplied by the child agent's ACR score, and routing the node to an evidence validation loop based on the resulting confidence value.

**Claim 7.** The method of Claim 1, further comprising detecting Byzantine majority corroboration by:

(a) clustering pending knowledge proposals by semantic similarity;

(b) for each cluster containing three or more proposals, verifying that the proposing agents are independent by confirming that no proposing agent is an ancestor or descendant of another proposing agent within two generations;

(c) upon verification of independence, computing a boosted confidence for the corroborated knowledge node using the formula: boosted_confidence = base_confidence + (1 - base_confidence) x (1 - 1/(n-1)), where n is the number of independent confirmations; and

(d) marking the corroborated node as validated without requiring evidence validation loop processing.

**Claim 8.** A computer-implemented system for pseudo-generational agent memory management, the system comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to:

(a) maintain a shared confidence-scored knowledge graph in a persistent data store;

(b) maintain an agent registry comprising, for each agent, an agent confidence reputation (ACR) score, a generation depth, a parent agent identifier, and historical merge statistics;

(c) spawn child agents with inherited graph slices and interest table weight vectors, subject to a configurable generational depth limit;

(d) upon child agent task completion, compute a knowledge delta between the child agent's current state and the inherited graph slice;

(e) execute a confidence-weighted merge of the delta into the shared knowledge graph, wherein the confidence weight is derived from the child agent's ACR score and generation depth;

(f) update the child agent's ACR score based on merge outcomes through a weighted composite of acceptance rate, confirmation rate, and contradiction rate;

(g) maintain a spawned-by lineage graph recording parent-child relationships between agents and attribution relationships between knowledge nodes and proposing agents; and

(h) support targeted rollback by traversing the lineage graph to quarantine all knowledge nodes contributed by a compromised agent and its descendant subtree.

**Claim 9.** The system of Claim 8, wherein the instructions further cause the system to enforce a generational confidence decay formula: effective_confidence = base_confidence x ACR x decay_rate^depth, where decay_rate is a configurable parameter, and wherein knowledge proposed by agents at greater generational depth enters the shared knowledge graph at progressively lower confidence.

**Claim 10.** The system of Claim 8, wherein the instructions further cause the system to detect Byzantine majority corroboration when three or more independent agents propose semantically equivalent knowledge nodes, and to boost the confidence of corroborated nodes based on the number of independent confirmations.

**Claim 11.** The system of Claim 8, wherein the instructions further cause the system to propagate interest table weight vectors from parent agents to child agents at spawn time, to constrain drift of child interest weights to a configurable maximum deviation from inherited weights, and to propose significant interest weight drift back to the parent agent when the child agent's ACR score exceeds a configurable threshold.

**Claim 12.** The system of Claim 8, wherein the ACR score for each agent undergoes time-based decay when the agent is inactive for longer than a configurable decay window, preventing stale reputation from persisting indefinitely.

**Claim 13.** The system of Claim 8, wherein the instructions further cause the system to record all delta-merge operations, ACR updates, quarantine events, and agent lifecycle events in a hash-chained audit log, wherein each audit entry comprises a SHA-256 hash of the previous entry, providing tamper-evident logging of all knowledge graph mutations.

**Claim 14.** A non-transitory computer-readable medium storing instructions that, when executed by a processor, cause the processor to perform a method comprising:

(a) maintaining a shared knowledge graph comprising confidence-scored knowledge nodes;

(b) spawning a child agent from a parent agent for a bounded task, the spawning comprising: (i) verifying that the resulting generational depth does not exceed a configurable maximum, (ii) initializing the child agent's confidence reputation score based on the parent agent's reputation score and generational depth, (iii) creating a confidence-weighted graph slice relevant to the bounded task, and (iv) recording a spawned-by edge in a lineage graph;

(c) upon task completion by the child agent, computing a delta between the child agent's accumulated knowledge and the inherited graph slice;

(d) for each node in the delta, computing a merge confidence as the product of the node's base confidence and the child agent's reputation score, and proposing the node for integration into the shared knowledge graph;

(e) routing proposed nodes through a validation pipeline based on the computed merge confidence, wherein nodes above a first threshold are submitted for immediate validation and nodes below the first threshold are queued for scheduled validation; and

(f) updating the child agent's reputation score based on the fraction of proposed nodes that are accepted, confirmed, or contradicted.

**Claim 15.** The medium of Claim 14, wherein the method further comprises:

(a) maintaining attribution edges linking each knowledge node in the shared knowledge graph to the agent that proposed it;

(b) upon identification of a compromised agent, traversing the lineage graph to enumerate all descendant agents;

(c) for each of the compromised agent and its descendants, collecting all knowledge nodes linked by attribution edges; and

(d) quarantining all collected knowledge nodes by reducing their confidence scores and marking them for re-validation.

**Claim 16.** The medium of Claim 14, wherein the method further comprises detecting when three or more independent agents propose semantically equivalent knowledge nodes, verifying independence by confirming that no two proposing agents share an ancestor-descendant relationship within two generations, and upon verification, boosting the confidence of the corroborated node according to a formula that increases confidence as the number of independent confirmations increases.

**Claim 17.** The medium of Claim 14, wherein the child agent's reputation score is initialized as the product of the parent agent's reputation score and a generational decay factor raised to the power of the child agent's generational depth, and wherein the reputation score is updated using an exponential moving average with a configurable smoothing factor.

**Claim 18.** The medium of Claim 14, wherein the method further comprises propagating interest table weight vectors from the parent agent to the child agent at spawn time, constraining drift of child interest weights to within a configurable maximum deviation from inherited weights, and proposing drift deltas back to the parent agent when the child agent's reputation score exceeds a configurable threshold and the drift magnitude exceeds a significance threshold.

**Claim 19.** The medium of Claim 14, wherein the semantic equivalence of knowledge nodes is determined by a two-strategy approach comprising: (i) exact label matching for nodes of the same type, and (ii) embedding-based cosine similarity comparison against a configurable similarity threshold for nodes that do not match exactly.

**Claim 20.** The medium of Claim 14, wherein the method further comprises supporting cross-organization federation by enforcing a minimum ACR floor for cross-tenant contributions, requiring human confirmation for cross-tenant knowledge proposals regardless of ACR score, and enforcing a separate generational depth limit for agents operating across organizational boundaries.

---

## 9. ABSTRACT

A computer-implemented system and method for managing pseudo-generational agent memory in multi-agent artificial intelligence systems operating on shared confidence-scored knowledge graphs. The system implements a delta-merge protocol that reconciles child agent knowledge back into the parent graph upon task completion, with confidence weights derived from a per-agent confidence reputation (ACR) score. The ACR score is a dynamic floating-point value computed from the agent's historical merge acceptance rate, human confirmation rate, and contradiction rate, creating a self-regulating quality feedback loop. A spawned-by lineage graph records parent-child relationships and knowledge attribution edges, enabling full provenance tracing from any knowledge node back through its entire generational chain. Generational depth limits with configurable confidence decay prevent unbounded spawning and confidence inflation. Targeted rollback quarantines all knowledge contributed by a compromised agent and its descendant subtree through lineage graph traversal. Byzantine majority confidence boosting detects when three or more independent agents corroborate semantically equivalent knowledge, boosting confidence without human intervention. A personality inheritance engine propagates interest table weight vectors across generations with bounded drift, enabling parent agents to evolve through the cumulative experience of their children. All operations are recorded in a hash-chained audit log for tamper-evident provenance verification.

---

## APPENDIX A: AI DISCLOSURE STATEMENT

Pursuant to USPTO guidance on AI-assisted patent applications, the applicant discloses the following:

Artificial intelligence tools were used during the preparation of this patent application in the following limited capacities:

1. **Drafting Assistance:** AI language models were used to assist with the drafting and formatting of this application's text based on the inventor's technical specifications, architectural designs, and conceptual notes.

2. **Prior Art Research Assistance:** AI-powered search tools were used to identify potentially relevant prior art references during the background research phase.

3. **Inventive Contribution:** All inventive concepts, technical architectures, algorithms, data structures, and novel claims disclosed herein originated from the named inventor, Cristian Xavier Ruvalcaba. No AI system contributed to the conception of the inventive subject matter. The core inventive concepts -- including the Agent Confidence Reputation scoring system, the delta-merge protocol with confidence-weighted reconciliation, the spawned-by lineage graph with targeted rollback, the generational depth limiter with confidence decay, the Byzantine majority confidence boosting mechanism, and the personality inheritance engine with bounded drift -- were conceived by the inventor based on original research and system design work.

4. **Review:** The inventor has reviewed the entirety of this application for accuracy and completeness.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-017
Entity Status: Micro Entity
