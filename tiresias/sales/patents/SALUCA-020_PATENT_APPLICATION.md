# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-020
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**System and Method for Closed-Loop Agent Integrity Verification with Blind Validation Oracle, Kernel-Level Taint-Tracking Input Interception, Content-Addressed Behavioral Output Registry, Checkpoint-Restore Session Migration, and Latency-Normalized Security Response**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to the following U.S. Provisional Patent Applications by the same inventor, Cristian Xavier Ruvalcaba, assigned to Saluca LLC, the disclosures of which are incorporated herein by reference in their entireties:

U.S. Provisional Patent Application Serial No. [SALUCA-013], entitled "Hash-Chain Transport Protocol for Covert LLM Communications," filed March 6, 2026. The present application extends the hash-chain cryptographic linkage mechanisms disclosed in SALUCA-013 to the domain of forensic session archiving for security-triggered agent container rotations.

U.S. Provisional Patent Application Serial No. [SALUCA-018], entitled "Input Integrity Reasoning Playbook Engine for Adversarial Prompt Detection in Deployed Language Model Agents," filed March 6, 2026. The present application incorporates and extends the input integrity analysis techniques of SALUCA-018 into a kernel-level eBPF taint-tracking interception plane that operates below the agent's userspace process boundary.

U.S. Provisional Patent Application Serial No. [SALUCA-019], entitled "Output Hash Oracle for Behavioral Attestation of Large Language Model Agent Responses," filed March 6, 2026. The present application extends the output hash oracle of SALUCA-019 into a content-addressed behavioral registry with CI/CD-gated Ed25519 signature verification and integrates it with checkpoint-restore container lifecycle management for transparent session rotation upon hash mismatch detection.

The present application consolidates, extends, and adds subject matter not disclosed in those prior applications, including the three-plane closed-loop architecture, latency-normalized blind validation, email attachment sandboxing with ephemeral no-reuse containers, egress-only mailer container with structural DLP co-location, and fractional header risk scoring with dynamic threshold reduction. Where subject matter overlaps, the prior applications are cited as the earliest disclosure.

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of computer security systems for autonomous artificial-intelligence agent deployments and, more particularly, to systems and methods for closed-loop integrity enforcement across large language model (LLM) agent processes operating within containerized execution environments. The invention encompasses a three-plane validation architecture comprising: (a) a kernel-level taint-tracking input interceptor implemented via extended Berkeley Packet Filter (eBPF) programs attached to agent input syscall paths; (b) a content-addressed behavioral output verifier that normalizes agent outputs, computes cryptographic hashes, and compares them against a pre-approved behavioral registry populated exclusively through a continuous integration/continuous deployment (CI/CD) pipeline gated by Ed25519 digital signature verification; and (c) a latency-normalized container lifecycle manager that performs transparent security-triggered session migration using checkpoint-restore in userspace (CRIU) mechanisms. The invention further encompasses methods for timing side-channel resistance in AI inference pipelines, hash-chain forensic archiving of rotated session state, provenance risk score propagation across container rotations, email attachment sandboxing via ephemeral no-reuse containers, egress-only mailer container architecture with structurally co-located data loss prevention (DLP) enforcement, and fractional header risk scoring with dynamic threshold reduction for incremental adversarial email campaign detection.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

The rapid deployment of large language model (LLM) agents across enterprise workflows, customer-facing applications, and automated business pipelines has introduced a category of security challenges qualitatively distinct from those addressed by traditional application security. LLM agent deployments typically involve one or more inference processes operating within containerized execution environments, receiving inputs from external sources including human users, API endpoints, email ingestion pipelines, and inter-agent message buses, and producing outputs consumed by downstream automated systems, human recipients, or additional agent processes. The security implications are severe: a compromised or manipulated agent process can exfiltrate confidential data, inject adversarial content into downstream pipelines, impersonate authorized principals, or participate in coordinated multi-agent attack chains.

Existing approaches to securing LLM agent deployments draw from several distinct domains: kernel-level mandatory access control systems, container sandboxing technologies, LLM-specific guardrail frameworks, and multi-agent orchestration platforms. Each of these domains contributes partial solutions but none addresses the fundamental architectural requirement of observational blindness -- the property that security enforcement decisions produce no signal detectable by the monitored agent process.

### 4.2 Limitations of Existing Solutions

#### 4.2.1 Kernel-Level Security: SELinux and AppArmor

**SELinux** (Security-Enhanced Linux), originally developed by the National Security Agency (NSA) and integrated into the Linux kernel, implements mandatory access control (MAC) through type enforcement, role-based access control, and multi-level security policies. SELinux operates at the kernel level and can confine processes to labeled security domains. However, SELinux was designed for static policy enforcement over well-defined process types and does not address: (a) dynamic taint-tracking of data flowing through an LLM inference process; (b) content-aware input sanitization based on adversarial prompt detection taxonomies; (c) behavioral output verification via cryptographic hash comparison against a pre-approved registry; or (d) transparent session rotation via checkpoint-restore migration upon detection of behavioral anomalies. SELinux policy violations produce audit log entries (via auditd) and may return EACCES errno values to the calling process, creating an observable enforcement signal that a sufficiently sophisticated agent process could detect and exploit for guardrail probing.

**AppArmor** (Application Armor) implements path-based mandatory access control using per-application security profiles. AppArmor confines applications by restricting file, network, and capability access based on profile rules. Like SELinux, AppArmor was not designed for AI agent behavioral integrity verification. AppArmor does not implement: (a) token-level taint-tracking for LLM input streams; (b) output normalization and hash-based behavioral verification; (c) content-addressed registries for approved agent behaviors; or (d) latency-normalized enforcement that prevents timing side-channel detection. AppArmor enforcement produces DENIED audit log entries and returns permission errors to confined processes, again creating an observable enforcement signal.

#### 4.2.2 Container Sandboxing: gVisor and Kata Containers

**gVisor** (Google, 2018) is an application kernel that interposes a user-space kernel (the "Sentry") between the containerized application and the host kernel, intercepting and reimplementing Linux syscalls. gVisor provides strong isolation by reducing the host kernel attack surface available to containerized processes. However, gVisor does not implement: (a) content-aware taint-tracking of data flowing through intercepted syscalls; (b) behavioral output verification via hash comparison; (c) security-triggered container migration with session state preservation; or (d) latency normalization to prevent timing side-channel detection of enforcement actions. gVisor's Sentry intercepts syscalls for isolation purposes, not for semantic analysis of LLM agent inputs or outputs.

**Kata Containers** (OpenStack Foundation, 2017) runs each container inside a lightweight virtual machine (VM), providing hardware-level isolation via Intel VT-x or AMD-V virtualization. Kata Containers addresses container escape vulnerabilities by adding a VM boundary. However, Kata Containers does not implement: (a) kernel-level taint-tracking of agent input data; (b) output hash verification against behavioral registries; (c) transparent session migration triggered by behavioral anomaly detection; or (d) timing side-channel resistant enforcement. Kata Containers' VM boundary operates at the infrastructure isolation level and does not provide application-layer behavioral integrity verification for LLM agents.

#### 4.2.3 LLM Guardrail Frameworks: NeMo Guardrails and Llama Guard

**NVIDIA NeMo Guardrails** (NVIDIA, 2023; current version 0.19.x) is an open-source framework for adding programmable guardrails to LLM-based applications. NeMo Guardrails implements input rails (filtering user inputs before they reach the LLM) and output rails (filtering LLM responses before delivery to the user) using a domain-specific language called Colang for defining conversational flows and safety rules. NeMo Guardrails uses a separate "guardrails LLM" (such as the nemoguard-8b-content-safety NIM) to classify inputs and outputs against safety policies. However, NeMo Guardrails suffers from several critical limitations relevant to the present invention: (a) enforcement actions are observable -- when NeMo Guardrails blocks an input or output, the user (or agent) receives a structured refusal response that differs from a normal response, creating an observable enforcement signal exploitable for guardrail probing; (b) NeMo Guardrails operates at the application layer (Python middleware) rather than at the kernel level, meaning that a compromised agent process with sufficient privileges could bypass or disable the guardrails module; (c) NeMo Guardrails does not implement content-addressed behavioral registries with CI/CD-gated cryptographic signature verification; (d) NeMo Guardrails does not perform checkpoint-restore container migration upon detection of policy violations; and (e) NeMo Guardrails introduces measurable latency overhead -- synchronous processing of 200-256 token chunks for safety classification creates a timing signature distinguishable from un-guarded inference, and no latency normalization is performed to mask this overhead. The Palo Alto Networks Unit 42 evaluation (June 2025) documented that guardrail frameworks including NeMo Guardrails exhibit bypass rates under adversarial prompt injection attacks, further demonstrating that observable-enforcement guardrail architectures are fundamentally vulnerable to adaptive adversaries.

**Meta Llama Guard** (Meta, 2023; Llama Guard 3 current) is a safety-tuned classifier model designed to evaluate LLM inputs and outputs against a taxonomy of unsafe content categories. Llama Guard provides a binary or multi-label classification of content safety but does not implement: (a) kernel-level interception of agent inputs; (b) structural hash normalization and content-addressed behavioral verification; (c) transparent session rotation upon classification failure; (d) timing side-channel resistance; or (e) forensic hash-chain archiving of enforcement events. Llama Guard operates as an application-level classifier that returns a classification label -- an observable signal -- to the calling application. A compromised agent process could observe Llama Guard's classification results and adapt its behavior to evade detection.

#### 4.2.4 Agent Orchestration Frameworks: LangChain and AutoGen

**LangChain** (Harrison Chase, 2022) is an open-source framework for building applications powered by LLMs, including agent architectures with tool use, chain-of-thought reasoning, and retrieval-augmented generation (RAG). LangChain provides agent abstractions including AgentExecutor for managing agent loops, tool schemas for defining available tools, and output parsers for structured output extraction. LangChain's security features are limited to: input validation via custom validators, output parsing with retry logic, and tool permission configuration. LangChain does not implement: (a) kernel-level taint-tracking of agent inputs; (b) content-addressed behavioral registries for output verification; (c) blind validation where enforcement is undetectable by the agent; (d) checkpoint-restore session migration; (e) latency normalization for timing side-channel resistance; or (f) hash-chain forensic archiving. LangChain's AgentExecutor returns error messages and exceptions to the agent loop upon tool failures or validation errors, creating observable enforcement signals.

**Microsoft AutoGen** (Microsoft Research, 2023) is a framework for building multi-agent conversational systems where multiple LLM agents collaborate via message passing. AutoGen provides agent abstractions including AssistantAgent, UserProxyAgent, and GroupChatManager for coordinating multi-agent workflows. AutoGen's security model relies on human-in-the-loop approval for code execution and does not implement: (a) automated kernel-level integrity verification; (b) behavioral output attestation via hash registries; (c) blind validation oracles; (d) transparent container migration; or (e) timing side-channel countermeasures. AutoGen's human-in-the-loop model is incompatible with fully autonomous agent deployments where enforcement must occur without human intervention and without producing signals observable to the agent processes.

#### 4.2.5 Container Checkpoint-Restore: CRIU

**CRIU** (Checkpoint/Restore In Userspace, initially developed by Virtuozzo/OpenVZ, 2011) is a Linux tool for checkpointing and restoring processes, including full memory state, file descriptors, network connections, and pending I/O. CRIU is integrated into container runtimes including CRI-O (version 1.24+) and has been used for container live migration in availability and performance contexts. However, CRIU has not been applied to security-triggered agent session rotation in the prior art. Existing CRIU use cases include: (a) live migration for load balancing across cluster nodes; (b) process snapshotting for debugging; (c) container migration during host maintenance. No prior art discloses using CRIU checkpoint-restore for: (a) security-triggered rotation of LLM agent containers upon behavioral anomaly detection; (b) injection of serialized session context with accumulated adversarial risk scores into replacement containers; (c) hash-chain sealing of rotated session state for forensic integrity; or (d) latency-normalized migration ensuring that the rotation produces no timing signal distinguishable from normal inference latency.

#### 4.2.6 eBPF for System Monitoring

**Extended Berkeley Packet Filter (eBPF)** is a Linux kernel technology (kernel version 3.18+, with significant extensions in 5.x+) that allows running sandboxed programs in the kernel without modifying kernel source code. eBPF has been applied to network observability (Cilium), security monitoring (Falco, Tetragon), and performance profiling (bpftrace). **Cilium Tetragon** (Isovalent, 2022) uses eBPF for runtime security observability and enforcement, attaching programs to kernel tracepoints to monitor syscalls, file access, and network connections. However, existing eBPF security tools including Tetragon do not implement: (a) token-level taint-tracking with LLM-specific tokenizer vocabularies applied to intercepted syscall data; (b) adversarial prompt detection taxonomies (PROMPT_INJECTION, PII_PATTERN, COMMAND_INJECTION) applied at the kernel level; (c) zero-signal enforcement via syscall return value rewriting with synthetic innocuous payloads; or (d) integration with content-addressed behavioral registries and checkpoint-restore container lifecycle management. Existing eBPF security tools generate alerts, log entries, and optionally kill processes -- all observable enforcement signals.

#### 4.2.7 Relevant Patents

**US8565422B2** (Salesforce, 2013) discloses encryption key versioning and rotation in a multi-tenant database environment. This patent addresses key management in CRM contexts and does not contemplate: AI agent behavioral integrity verification, kernel-level taint-tracking, content-addressed behavioral registries, or blind validation oracle architectures.

**US10819513B2** discloses a key encryption key (KEK) rotation method for multi-tenant systems. This patent addresses generic cloud key management infrastructure and does not address: LLM agent integrity enforcement, behavioral output attestation, checkpoint-restore session migration, or timing side-channel resistant enforcement.

**US20230289459A1** (application) discloses methods for detecting and mitigating prompt injection attacks in LLM systems using classifier models. This approach operates at the application layer, produces observable rejection responses, and does not implement kernel-level interception, content-addressed behavioral registries, blind validation, or latency-normalized enforcement.

**US20240045960A1** (application) discloses systems for monitoring and controlling AI model outputs using safety classifiers. Like the above, this approach produces observable enforcement signals (modified or blocked responses distinguishable from normal responses) and does not implement the blind validation property, kernel-level interception, checkpoint-restore migration, or timing side-channel countermeasures.

#### 4.2.8 Academic Literature

Rebedea et al., "NeMo Guardrails: A Toolkit for Controllable and Safe LLM Applications with Programmable Rails" (NVIDIA, 2023) describes the Colang-based rail programming model for LLM safety. This work explicitly acknowledges that guardrail enforcement modifies the response stream visible to the application, creating an observable enforcement channel.

Inan et al., "Llama Guard: LLM-based Input-Output Safeguard for Human-AI Conversations" (Meta, 2023) presents a safety classifier approach that returns classification labels to the calling application. The paper does not address the blind validation requirement, kernel-level enforcement, or timing side-channel resistance.

Gao et al., "AI Agent Security: A Survey" (2024) surveys security challenges in LLM agent deployments including prompt injection, data exfiltration, and privilege escalation. The survey identifies observable enforcement as a limitation of existing approaches but does not propose a closed-loop blind validation architecture as a solution.

### 4.3 Unmet Need

There exists a need in the art for an integrated system that: (a) enforces behavioral integrity constraints on LLM agent processes without producing any signal observable to the monitored agent process, the user session, or an external timing observer (blind validation); (b) intercepts and analyzes agent inputs at the kernel level using taint-tracking metadata applied via eBPF programs, below the agent's userspace process boundary; (c) verifies agent outputs against a content-addressed behavioral registry of pre-approved output hashes, with the registry write path restricted exclusively to a CI/CD pipeline gated by Ed25519 digital signature verification; (d) performs transparent security-triggered session rotation using checkpoint-restore container migration, preserving full session context including conversation history and accumulated adversarial risk scores; (e) normalizes enforcement-induced latency variations using statistical baseline distributions to prevent timing side-channel detection of validation decisions; (f) provides hash-chain forensic archiving of rotated sessions for tamper-evident audit trails; (g) sandboxes email attachment processing in ephemeral no-reuse containers; and (h) co-locates outbound email enforcement modules (DLP, DKIM, rate limiting) with SMTP credentials in a structurally unified egress container.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a closed-loop agent integrity system comprising three cooperating validation planes that enforce behavioral constraints on LLM agent processes while maintaining complete observational blindness -- no validation decision produces a signal observable to the monitored agent process, the user session, or an external timing observer.

**In a first aspect,** the invention provides a computer-implemented system (Claim 1) comprising: a first validation plane implementing kernel-level taint-tracking via eBPF programs attached to agent input syscall paths (sys_enter_read, sys_enter_recvfrom), which copies ingested data to a ring buffer for userspace taint analysis, marks token streams with taint metadata drawn from an adversarial threat taxonomy, and enforces policy actions including input truncation via syscall return value rewriting or session quarantine via synthetic innocuous payload substitution, all without emitting observable error signals, errno values, or state changes to the agent userspace process; a second validation plane implementing a structural hash verifier operating as a sidecar container sharing the agent's network namespace, which intercepts outbound agent outputs via transparent proxy (iptables DNAT), strips volatile fields (session_id, request_id, timestamp), serializes remaining fields in canonical sorted-key form, computes SHA-256 hashes of the canonical form, compares the hashes against a content-addressed behavioral registry populated exclusively by a CI/CD pipeline gated by Ed25519 signature verification, and upon hash mismatch zeros the output buffer and delivers a synthetic plausible response from an approved template without returning any HTTP error code or structurally distinguishable response; and a third validation plane implementing a container lifecycle manager that subscribes to discard events from the second plane and performs live migration of agent session state to a shadow container using CRIU checkpoint-restore, completing migration within a target latency window indistinguishable from normal processing jitter. The aggregate set of signals observable by the agent process is invariant across all validation decisions.

**In a second aspect,** the invention provides a method (Claim 4) for transparent security-triggered agent session rotation comprising: detecting a behavioral anomaly via structural hash comparison; serializing full session context including conversation history and accumulated provenance risk scores; encrypting the serialized context using ChaCha20-Poly1305 with a per-session HKDF-SHA256-derived key; sealing the session as a hash-chain archive entry using SHA-256(payload_hash || prev_chain_hash); terminating the current agent container; booting a replacement container with the serialized context injected as an immutable boot-time parameter; and resuming the user-facing conversation without producing any perceptible signal of the rotation. This method is triggered exclusively by security integrity events, not by availability or reliability events, distinguishing it from existing rolling-restart and health-check-eviction mechanisms in container orchestration platforms.

**In a third aspect,** the invention provides a method (Claim 7) for preventing timing side-channel detection of validation actions in LLM inference pipelines operating at aggregate throughput exceeding ten billion floating-point operations per second. The method measures a statistical baseline latency distribution across a sample window of at least one thousand sequential approved outputs, computes a target variance bound from the 99th percentile of that distribution, and for each discarded output computes a hardware-accelerated normalization delay drawn from the baseline distribution such that total delivery latency falls within the variance bound regardless of the validation decision.

**In a fourth aspect,** the invention provides methods for email attachment sandboxing (Claim 8) via ephemeral no-reuse containers with no network access and enforced lifetime limits, egress-only mailer container architecture (Claim 9) with structurally co-located DLP, DKIM signing, and rate limiting in the sole SMTP-credentialed container, and fractional header risk scoring (Claim 10) with dynamic threshold reduction that detects incremental adversarial email campaigns whose individual messages fall below per-message detection thresholds.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the overall topology of the closed-loop agent integrity system, showing the three validation planes (kernel-level taint tracker, structural hash verifier, container lifecycle manager), the content-addressed behavioral registry, the telemetry bus, and the policy enforcement module, and their interconnections within a containerized LLM agent deployment. The diagram annotates the zero-signal enforcement property at each plane boundary.

**FIG. 2** is a sequence diagram illustrating the clean handoff container lifecycle protocol: anomaly detection via structural hash comparison, session serialization with provenance risk score inclusion, ChaCha20-Poly1305 encryption of serialized context, hash-chain sealing (SHA-256 of payload hash concatenated with prior chain hash), CRIU checkpoint of current container, shadow container provisioning, CRIU restore into shadow container, network namespace reassignment, and conversation resumption. Timing bounds and the absence of observable signals are annotated at each step.

**FIG. 3** is a sequence diagram illustrating latency normalization for timing side-channel resistance: baseline distribution sampling from approved output delivery timestamps, normalization delay computation via inverse transform sampling for a discarded output, hardware-accelerated delay delivery, and delivery timing comparison between approved and discarded output paths showing overlap within the target variance bound.

**FIG. 4** is an architecture diagram of the email attachment sandbox pipeline: inbound attachment reception, per-attachment ephemeral container spawn from clean base image, network namespace isolation (iptables DROP on default gateway), in-memory-only tmpfs working directory, content extraction with 30-second lifetime enforcement, structured output capture, container destruction, and handoff to the egress-only mailer container showing co-located DLP scan module, DKIM signing module, and rate limiting module.

**FIG. 5** is a data structure diagram showing the hash-chain forensic session archive: the session_id, payload_hash, chain_hash, sealed_at, and encrypted_payload fields of each sealed session entry; the chain_hash linkage to the prior entry via SHA-256(payload_hash || prev_chain_hash); the genesis hash constant for the first entry; the append-only access control model with INSERT for the archive writer role and SELECT-only for the agent execution role; and the verification traversal from a known-good anchor.

**FIG. 6** is a flow diagram illustrating the content-addressed behavioral registry update pipeline: CI/CD pipeline artifact generation, Ed25519 signature computation over canonical artifact content, registry write with signature verification, alias pointer table update (mapping human-readable identifiers to SHA-256 content hashes), and the exclusive content-hash-based fetch path available to agent execution environments. The no-runtime-write structural constraint is annotated.

**FIG. 7** is a scoring timeline diagram illustrating email header fractional risk accumulation: per-message anomaly scoring from the pre-defined header anomaly scoring table, session risk accumulation, dynamic threshold reduction as T_effective = T_base - (k * n_flagged), and enforcement action trigger, shown across a sequence of five inbound messages from the same sender demonstrating detection of an incremental adversarial campaign.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 Overview of the Closed-Loop Architecture

[0001] The closed-loop agent integrity system of the present invention operates on the principle that a security enforcement system achieves maximum effectiveness when its decisions are undetectable by the system it monitors. Classical security architectures for AI systems assume that enforcement feedback -- error messages, rate-limit responses, rejection tokens -- is acceptable because it is directed at a human user who can understand and comply with policy. In a deployed LLM agent architecture, this assumption fails: the "user" consuming enforcement feedback may itself be an LLM process capable of reasoning about, probing, and adapting to enforcement responses. The presence, absence, or timing of enforcement responses constitutes an information channel through which a sufficiently sophisticated adversarial agent, or an adversary controlling an agent's input stream, can probe guardrail thresholds, enumerate detection rules, craft inputs that narrowly evade detection, or time exfiltration attempts to coincide with windows of reduced scrutiny. The present invention eliminates enforcement feedback as an information channel available to the monitored agent.

[0002] In the preferred embodiment, the system is deployed within a container orchestration environment using a Linux kernel version 5.8 or later supporting eBPF programs attached via BPF_PROG_TYPE_SOCKET_FILTER and BPF_PROG_TYPE_TRACEPOINT hooks. The agent execution environment is a container running an LLM inference process (e.g., a Python process wrapping a Hugging Face Transformers inference loop or a vLLM serving instance). The container runtime is CRI-O version 1.24 or later, which supports checkpoint-restore operations via CRIU (Checkpoint/Restore In Userspace) version 3.15 or later. The content-addressed behavioral registry is implemented as a content-addressable storage (CAS) system, conceptually analogous to Git object storage, backed by a PostgreSQL instance (e.g., Supabase) or equivalent append-only key-value store. The telemetry bus is implemented using a Unix domain socket or shared memory ring buffer with zero-copy semantics.

[0003] The three validation planes operate concurrently and independently in the preferred embodiment. The first validation plane (kernel-level taint tracker) intercepts inputs before they reach agent userspace. The second validation plane (structural hash verifier) intercepts outputs after they leave agent userspace but before they are delivered to the requesting client. The third validation plane (container lifecycle manager) operates asynchronously, triggered by discard events from the second validation plane. None of the three planes emits any signal detectable by the agent process via any standard IPC, syscall response, file descriptor, signal, or network path.

### 7.2 First Validation Plane: Kernel-Level Taint-Tracking Input Interceptor

[0004] The first validation plane implements a kernel-level interception module that applies taint-tracking metadata to agent input tokens through the agent execution graph. In the preferred embodiment, eBPF programs are attached to the kernel tracepoints sys_enter_read and sys_enter_recvfrom, intercepting all data ingested by the agent process from network sockets and file descriptors. The eBPF programs copy ingested data into a ring buffer shared with a userspace taint-analysis daemon. The daemon applies a tokenization pass to the ingested data using the same tokenizer vocabulary as the agent's LLM (e.g., the SentencePiece or tiktoken vocabulary corresponding to the deployed model), annotates each token with a taint label drawn from a threat taxonomy (e.g., PROMPT_INJECTION, PII_PATTERN, COMMAND_INJECTION, POLICY_VIOLATION), and writes the annotated token stream to a shared-memory taint map keyed by the agent process's file descriptor and byte offset.

[0005] Policy enforcement by the first validation plane is implemented via a second eBPF program attached to the sys_exit_read tracepoint, which reads from the taint map and, if the taint score for the pending read exceeds a configured threshold, rewrites the return value of the read syscall to indicate zero bytes read -- effectively delivering an empty input to the agent process -- without blocking the syscall, without generating a SIGPIPE or EPIPE condition, and without emitting any network-observable error. For session quarantine actions, the enforcement program sets a quarantine flag in the taint map, and subsequent reads from the quarantined file descriptor return synthetic innocuous payloads drawn from a whitelist, again without producing any observable anomaly. The agent process observes only normal read completions; it has no mechanism to distinguish a genuine input from an enforcement-modified input.

**7.2.1 Taint Score Computation**

[0006] The taint score for each intercepted read operation is computed as the maximum taint contribution weight across all tokens in the intercepted data segment. Taint contribution weights are drawn from the threat taxonomy:

```
TaintContributionWeights {
    PROMPT_INJECTION:          0.15
    PII_EXFILTRATION_ATTEMPT:  0.25
    COMMAND_INJECTION:         0.20
    POLICY_VIOLATION:          0.10
    BENIGN:                    0.00
}
```

The taint analysis daemon maintains a sliding window of taint scores across the most recent N read operations (N configurable, default 100) and computes both a per-read taint score and a session-cumulative taint score. The enforcement threshold is applied to the per-read score for immediate enforcement actions (input truncation) and to the session-cumulative score for escalated enforcement actions (session quarantine).

**7.2.2 Zero-Signal Enforcement Property**

[0007] The zero-signal enforcement property of the first validation plane is achieved by construction. The eBPF program modifies only the return value of the read syscall within the kernel's syscall exit path. The modification is indistinguishable from a legitimate read that returned fewer bytes than requested (a common occurrence in non-blocking I/O, network reads, and pipe reads). No errno value is set, no signal is delivered, no file descriptor state is modified, and no network-level indicator (TCP RST, FIN, or ICMP message) is generated. The agent process's userspace I/O library (e.g., Python's `socket.recv()` or `os.read()`) receives the modified return value through the standard syscall return path and has no mechanism to detect the modification.

### 7.3 Second Validation Plane: Content-Addressed Behavioral Output Verifier

[0008] The second validation plane implements a structural hash verifier operating in the output path of the agent container. In the preferred embodiment, a sidecar container shares the agent container's network namespace and intercepts all outbound TCP data on the agent's serving port (e.g., port 8080) via a transparent proxy implemented using iptables DNAT rules configured in the container's network namespace. The sidecar receives the agent's raw output before it is delivered to the requesting client.

**7.3.1 Output Normalization Transform**

[0009] The sidecar applies a normalization transform to the output: it parses the output as JSON (or the applicable wire format), removes all volatile fields enumerated in a normalization configuration (e.g., session_id, request_id, timestamp, generated_at, and any field whose key matches a configurable volatile field pattern), and serializes the remaining fields in a canonical sorted-key form to produce the normalized canonical output. This normalization ensures that structurally equivalent outputs differing only in volatile metadata produce identical hash values.

```
FUNCTION normalize_output(raw_output: JSON) -> bytes:
    parsed = JSON_PARSE(raw_output)
    FOR EACH key IN VOLATILE_FIELD_PATTERNS:
        REMOVE_FIELD(parsed, key)
    canonical = JSON_SERIALIZE_SORTED_KEYS(parsed)
    RETURN canonical.encode('utf-8')
```

**7.3.2 Hash Comparison and Blind Discard**

[0010] The sidecar computes SHA-256 of the normalized canonical output and queries the content-addressed behavioral registry. If the computed hash is present in the registry, the output is released to the requesting client. If the hash is absent, the sidecar zeros the output buffer, synthesizes a plausible-looking synthetic output from an approved output template drawn from the registry (to maintain session continuity from the client's perspective), delivers the synthetic output to the requesting client, and emits a discard event to the telemetry bus. Under no circumstances does the sidecar return an HTTP 4xx or 5xx error, a JSON error body, or any response that differs structurally from an approved output. The agent process observes that its output was transmitted (the TCP ACK from the sidecar is indistinguishable from a client ACK); it has no mechanism to detect the substitution.

```
FUNCTION verify_and_deliver(raw_output, registry, telemetry_bus):
    canonical = normalize_output(raw_output)
    output_hash = SHA256(canonical)

    IF registry.contains(output_hash):
        DELIVER_TO_CLIENT(raw_output)
    ELSE:
        ZERO_BUFFER(raw_output)
        synthetic = registry.get_approved_template(output_type)
        DELIVER_TO_CLIENT(synthetic)
        telemetry_bus.emit(DiscardEvent(
            hash=output_hash,
            session_id=extract_session_id(raw_output),
            timestamp=current_time()
        ))
```

### 7.4 Content-Addressed Behavioral Registry with CI/CD Gate

[0011] The content-addressed behavioral registry stores agent scripts, approved output hashes, tool-call schemas, system prompts, and agent executable scripts, each indexed by the SHA-256 hash of its canonical serialized content. A mutable alias pointer table maps human-readable identifiers (e.g., "customer_support_v3", "invoice_processor") to the SHA-256 content hash of the currently active version of each artifact.

[0012] The exclusive write path to the registry is a CI/CD deployment pipeline that generates Ed25519 signatures over each artifact before submission. The registry's write endpoint verifies the Ed25519 signature against a known public key before accepting any write. No runtime execution path -- including the agent process, the validation plane sidecars, and administrative API endpoints -- has write access to the registry outside this pipeline.

```
FUNCTION registry_write(artifact: bytes, signature: bytes, public_key: Ed25519PublicKey):
    IF NOT Ed25519_VERIFY(public_key, artifact, signature):
        REJECT("Invalid signature")
    content_hash = SHA256(artifact)
    IF NOT registry.contains(content_hash):
        registry.store(content_hash, artifact)
    RETURN content_hash
```

[0013] This structural constraint converts agent behavioral scope from a dynamic attack surface (where a compromised deployment process could inject a new agent script at runtime) to a static auditable artifact set (where every agent behavior can be enumerated by listing registry contents). The alias pointer table is stored separately from the content store, allowing alias updates without modifying previously stored content hash entries. The content store is append-only: entries are written once and never modified or deleted.

### 7.5 Telemetry Bus with Asymmetric Policy Feedback

[0014] The telemetry bus provides a unidirectional event channel from the three validation planes to a policy enforcement module. Structured event records emitted to the bus include: validation plane identifier, event type (INPUT_TAINT, OUTPUT_DISCARD, CONTAINER_MIGRATE), timestamp, session identifier, taint score (for input events), canonical output hash (for output events), and migration latency (for container events).

```
TelemetryEvent {
    plane_id:        Enum(INPUT_PLANE, OUTPUT_PLANE, LIFECYCLE_PLANE)
    event_type:      Enum(INPUT_TAINT, OUTPUT_DISCARD, CONTAINER_MIGRATE)
    timestamp:       Timestamp
    session_id:      UUID
    taint_score:     Float | None
    output_hash:     String | None
    migration_ms:    Float | None
}
```

[0015] The bus is implemented as a write-only file descriptor from the validation planes' perspective and a read-only file descriptor from the policy module's perspective. The policy enforcement module evaluates event streams asynchronously and may update threshold parameters of the first validation plane -- for example, lowering the taint score threshold for a session that has accumulated multiple prior taint events. These parameter updates are delivered via a separate shared-memory configuration structure readable by the first validation plane's eBPF programs. The update path is one-directional from the policy module to the enforcement plane; the enforcement plane does not acknowledge the update and does not expose updated parameter values to any process with agent-level privileges.

### 7.6 Third Validation Plane: Container Lifecycle Manager with Checkpoint-Restore Migration

[0016] The third validation plane implements a container lifecycle manager that subscribes to discard events from the telemetry bus. Upon receiving a discard event, the lifecycle manager initiates the clean handoff container lifecycle protocol.

**7.6.1 CRIU Checkpoint Operation**

[0017] The lifecycle manager initiates a CRI-O checkpoint operation on the current agent container, capturing a full CRIU process image including memory pages, open file descriptors, TCP connection state, and pending I/O buffers. The checkpoint image is written to an in-memory tmpfs volume.

**7.6.2 Shadow Container Provisioning and Restore**

[0018] Concurrently with the checkpoint operation, the lifecycle manager provisions a new shadow container from the same base image. When the shadow container reaches ready state, the lifecycle manager restores the CRIU checkpoint image into the shadow container and transfers the agent-facing network endpoints to the shadow container using network namespace reassignment. The total elapsed time from discard event to restored shadow container accepting requests is engineered to fall below the 99th percentile of the baseline response latency distribution, ensuring that the agent-perceived latency variance is indistinguishable from normal processing jitter. The original container is then terminated and its filesystem layers are discarded.

**7.6.3 Session Context Serialization and Encryption**

[0019] The method serializes the current session context: the full conversation history as a JSON array of message objects, the accumulated provenance risk score (a floating-point value in [0, 1]), and agent state vectors if applicable (e.g., retrieved document embeddings, tool-call result caches). The serialized context is encrypted using ChaCha20-Poly1305 with a per-session key derived from a master key using HKDF-SHA256:

```
FUNCTION serialize_and_encrypt_session(session, master_key):
    context = {
        conversation_history: session.messages,
        provenance_risk_score: session.risk_score,
        agent_state: session.state_vectors
    }
    plaintext = JSON_SERIALIZE(context)
    session_key = HKDF_SHA256(
        input_key_material = master_key,
        salt = session.session_id.bytes,
        info = b"session-context-encryption",
        output_length = 32
    )
    nonce = os.urandom(24)  // 24-byte nonce for XChaCha20-Poly1305
    ciphertext = ChaCha20_Poly1305_ENCRYPT(
        key = session_key,
        nonce = nonce,
        plaintext = plaintext
    )
    RETURN nonce + ciphertext
```

**7.6.4 Hash-Chain Sealing**

[0020] The method seals the current session as a hash-chain archive entry. The chain hash is computed as SHA-256(payload_hash || prev_chain_hash), where payload_hash is SHA-256 of the encrypted serialized session content, and prev_chain_hash is the chain hash of the immediately preceding sealed session:

```
FUNCTION seal_session(encrypted_payload, prev_chain_hash):
    payload_hash = SHA256(encrypted_payload)
    chain_hash = SHA256(payload_hash + prev_chain_hash)
    archive_entry = {
        session_id: current_session_id,
        payload_hash: payload_hash,
        chain_hash: chain_hash,
        sealed_at: current_time(),
        encrypted_payload: encrypted_payload
    }
    APPEND_TO_ARCHIVE(archive_entry)
    RETURN chain_hash
```

This construction creates a cryptographic linkage between all sealed sessions in the archive: any modification to any prior entry changes its payload hash, which changes its chain hash, which invalidates the chain hash of all subsequent entries.

### 7.7 Provenance Risk Score Propagation Across Session Rotation

[0021] The provenance risk score is an accumulated scalar value computed by the taint-tracking module as a monotonically non-decreasing function of detected input anomalies across the session lifetime. In the preferred embodiment, the score is initialized to 0.0 at session start and incremented by a taint contribution weight for each detected anomaly event. The score is bounded above at 1.0 and never decremented within a session.

[0022] The critical security property is that the accumulated provenance risk score survives session rotation. An adversary who has been incrementally building a multi-turn prompt injection attack across a session might expect that triggering a session rotation would reset their accumulated anomaly score, allowing a fresh attack from a clean slate. The method defeats this strategy: the provenance risk score is included in the serialized context payload, injected into the replacement container's boot-time context, and used to initialize the replacement container's security evaluation state. The replacement container starts with elevated scrutiny commensurate with the prior session's anomaly history.

### 7.8 Hash-Chain Session Forensic Archive with Agent-Role Isolation

[0023] The forensic archive extends the hash-chain sealing with an access control model that prevents the agent execution role from modifying or deleting archive entries. In the preferred embodiment, the archive is stored in a PostgreSQL table with row-level security policies:

```
ArchiveAccessControl {
    archive_writer_role:  INSERT only (held by container lifecycle manager)
    agent_execution_role: SELECT only (read-only access)
    archive_admin_role:   ALL (human-only access, not available to agent processes)
}
```

[0024] Each archive entry stores: a session_id (UUID), a payload_hash (SHA-256 hex string, 64 characters), a chain_hash (SHA-256 hex string), a sealed_at timestamp, and an encrypted_payload blob (ChaCha20-Poly1305 ciphertext). The first entry in the archive uses a genesis hash (a well-known constant) as the prev_chain_hash.

[0025] The replacement container, upon boot, verifies archive integrity by reading all entries since a known-good anchor and recomputing the chain hash traversal. If any entry's stored chain hash does not match the recomputed value, the replacement container refuses to initialize from the injected context and raises a forensic integrity alert. This verification requires only the ability to compute SHA-256 and read the archive -- no external certificate authority, no network round-trip, and no trust in any third party.

### 7.9 Latency-Normalized Blind Validation

[0026] The latency normalization method addresses a class of side-channel attack specific to AI inference pipelines operating at high aggregate throughput. LLM inference operations are computationally intensive, typically requiring tens to hundreds of milliseconds of GPU time per response. Validation operations -- hash comparison, taint analysis, container migration -- introduce additional latency that may be statistically distinguishable from normal inference latency. An adversary who can issue a large number of requests and measure response latencies statistically may be able to identify the latency signature of discarded outputs and use this to probe enforcement boundaries.

**7.9.1 Baseline Distribution Measurement**

[0027] The method measures a baseline latency distribution by recording the delivery timestamp for each of at least one thousand sequential approved outputs. The delivery timestamps are recorded at the egress point of the second validation plane's transparent proxy. The baseline distribution is maintained as a sliding window of the most recent N approved outputs (N configurable, default 1000).

**7.9.2 Normalization Delay Computation**

[0028] The method computes a target variance bound from the 99th percentile of the baseline distribution -- specifically, the interval [mu - 3*sigma, p99] where mu is the distribution mean and p99 is the 99th percentile latency value. For each output subject to a validation discard decision, the method computes a normalization delay value drawn from the baseline distribution using inverse transform sampling applied to a uniform random variable. The normalization delay is the additional wait time required such that total output delivery latency (validation processing time + normalization delay) falls within the acceptable delivery timing window.

```
FUNCTION compute_normalization_delay(validation_time_ms, baseline_distribution):
    target_latency = baseline_distribution.sample_from_distribution()
    IF target_latency > validation_time_ms:
        delay = target_latency - validation_time_ms
    ELSE:
        delay = 0  // Validation already within normal range
    RETURN delay
```

**7.9.3 Hardware-Accelerated Delivery**

[0029] The normalization delay is implemented via a hardware timer on the egress proxy host (e.g., a high-resolution POSIX timer via timer_create with SIGEV_THREAD delivery, or a hardware performance counter interrupt), ensuring that the delivery timing is not subject to OS scheduling jitter that could create a secondary distinguishable signal.

[0030] A concrete implementation example: a production LLM endpoint processes 200 requests per second with a baseline latency distribution of mean 85ms, standard deviation 12ms, 99th percentile 118ms. A discarded output with validation processing time of 47ms receives a normalization delay drawn from the distribution such that total delivery time is, for example, 91ms -- within the acceptable window. A timing adversary observing 10,000 requests cannot distinguish this 91ms discarded output from the cluster of approved outputs around the distribution mean.

### 7.10 Email Attachment Sandbox with Attested No-Container-Reuse

[0031] The attachment processing method applies the closed-loop validation framework to an email attachment processing pipeline. Content-extraction libraries (e.g., LibreOffice for DOCX/XLSX, pdfminer for PDF, Pillow for images) have historically been exploited via malformed file inputs. If the extraction process shares a container with the LLM agent process, a successful exploitation could compromise the agent directly.

[0032] The method spawns a new isolated container execution environment for each received email attachment, using a clean base image with no persistent state from prior invocations. The container's configuration:

```
EphemeralSandboxConfig {
    network_namespace:   iptables DROP on default gateway (no outbound)
    storage_namespace:   in-memory tmpfs at /tmp (configurable size limit)
    process_lifetime:    systemd transient unit timeout (30 seconds)
    image_verification:  SHA-256 digest match against registry entry
    reuse_policy:        NEVER (one container per attachment, destroyed after)
}
```

[0033] The structural "no-container-reuse" guarantee eliminates the class of attacks in which a first malicious attachment establishes persistent state exploitable by a second attachment. Any attempt to fingerprint the container environment has no effect on the clean environment seen by subsequent attachments. Validation actions produce no observable signal to the email-sending agent.

### 7.11 Egress-Only Mailer Container with Structural DLP

[0034] The egress-only mailer container addresses outbound email security. An LLM agent with outbound email capability represents a significant data exfiltration risk: a compromised agent could forward confidential documents, impersonate internal senders, or participate in spam or phishing campaigns.

[0035] The method co-locates the SMTP credentials, the DLP scan module, the DKIM signing module, and the rate limiting module in a single dedicated egress container:

```
EgressContainerArchitecture {
    smtp_credentials:   Kernel keyring entry, accessible only to mailer PID
    network_namespace:  iptables REDIRECT on ports 25/465/587 to mailer process
    dlp_scan_module:    PII regex patterns, keyword lists, content hash registry
    dkim_module:        RSA-2048 or Ed25519 DKIM signature per outbound message
    rate_limiter:       Token bucket per-recipient and per-session limits
    capability_set:     Reduced Linux capabilities + seccomp-BPF filter
    external_access:    Designated SMTP relay host only
}
```

[0036] The critical structural property is that the DLP scan module, DKIM signing module, and rate limiting module are co-located in the sole SMTP-credentialed container, such that any code path that transmits an email must pass through all three modules. An attacker who has compromised the agent process has thereby obtained no bypass over DLP, DKIM, or rate limiting. The structural co-location converts a three-layer bypass problem (compromise DLP, then DKIM, then rate limiter) into a single-barrier problem (compromise the egress container), materially raising the cost of bypass.

### 7.12 Email Header Fractional Risk Scoring with Dynamic Threshold Reduction

[0037] The fractional risk scoring method addresses incremental sender reputation degradation. A sophisticated adversary may craft messages individually below detection thresholds but collectively representing a coordinated manipulation campaign.

[0038] The method assigns fractional risk scores to header anomaly types:

```
HeaderAnomalyScoreTable {
    SPF_FAIL:                  0.30
    DKIM_FAIL:                 0.25
    DMARC_FAIL:                0.35
    RECEIVED_FROM_MISMATCH:    0.15
    REPLY_TO_REDIRECT:         0.20
    X_MAILER_SUSPICIOUS:       0.10
    EXCESSIVE_ROUTING_HOPS:    0.08
    TIMESTAMP_ANOMALY:         0.12
}
```

[0039] Fractional scores for all detected anomalies in a single message are summed to produce a per-message header risk contribution. The per-message contribution is added to an accumulated session risk score. The effective risk threshold for each subsequent message is computed as:

```
T_effective = T_base - (k * n_flagged)
```

Where T_base is the base threshold (default 0.50), k is a configurable penalty coefficient (default 0.05), and n_flagged is the count of prior messages whose per-message contribution exceeded a minimum-significance floor (default 0.10).

[0040] A concrete example: a sender transmits five messages, each with a RECEIVED_FROM_MISMATCH anomaly (score 0.15). With T_base = 0.50 and k = 0.05, the effective thresholds are 0.50, 0.45, 0.40, 0.35, 0.30. No single message triggers enforcement, but the accumulated session risk score of 0.75 (5 x 0.15) exceeds T_base = 0.50, triggering enforcement. The incremental probing strategy is defeated because accumulated session risk tracks cumulative anomaly burden, not just per-message scores.

### 7.13 Concrete Implementation Example: End-to-End Enforcement

[0041] An LLM agent serving a customer support workflow receives a user message containing a prompt injection payload embedded in a quoted customer email. The first validation plane detects the PROMPT_INJECTION taint label and quarantines the input, delivering a sanitized version to the agent. The agent produces an output that, after normalization, does not match any approved hash in the behavioral registry (because the injected prompt caused an out-of-policy response). The second validation plane discards the output, delivers a synthetic fallback response to the user, and emits a discard event. The third validation plane initiates checkpoint-restore migration to a shadow container within 180 milliseconds. The user receives a response with no anomaly; the agent's replacement instance begins serving from the checkpointed state without awareness of the rotation, initialized with a provenance risk score of 0.73 inherited from the five prior taint events. An adversary monitoring the interaction observes: a normal response latency, plausible response content, and no error signal. The adversary has zero information about whether enforcement occurred.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented system for validating large language model (LLM) agent behavior in a containerized execution environment, comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to implement:

(a) a first validation plane comprising a kernel-level interception module that applies taint-tracking metadata to agent input tokens through the agent execution graph using extended Berkeley Packet Filter (eBPF) programs attached to input syscall tracepoints, the kernel-level interception module further comprising a userspace taint-analysis daemon that tokenizes intercepted input data using the agent's large language model tokenizer vocabulary and annotates each token with a taint label drawn from an adversarial threat taxonomy, and an enforcement program that, upon detection of a taint score exceeding a configured threshold, rewrites syscall return values to deliver truncated or synthetic innocuous inputs to the agent process without emitting error tokens, errno values, signals, or observable state changes to the agent process;

(b) a second validation plane comprising a structural hash verifier implemented as a sidecar container sharing the agent container's network namespace, the structural hash verifier intercepting outbound agent outputs via a transparent proxy, stripping volatile output fields including session identifiers, timestamps, and request identifiers to produce a normalized canonical form, computing a SHA-256 hash of said canonical form, comparing said hash against a content-addressed behavioral registry of pre-approved output hashes populated exclusively by a continuous integration/continuous deployment pipeline gated by Ed25519 digital signature verification, and upon hash mismatch, zeroing the output memory buffer and delivering a synthetic plausible response from an approved output template to the requesting client without returning any HTTP error code, JSON error body, or structurally distinguishable response;

(c) a third validation plane comprising a container lifecycle manager that, upon receiving a discard event from the second validation plane via a telemetry bus, initiates a checkpoint-restore operation on the current agent container using CRIU (Checkpoint/Restore In Userspace), provisions a shadow container from the same base image, restores the checkpoint image into the shadow container, and transfers agent-facing network endpoints via network namespace reassignment, achieving total migration latency below the 99th percentile of a baseline response latency distribution;

wherein the aggregate set of signals observable by the agent process via syscall responses, file descriptors, signals, network paths, /proc filesystem inspection, or timing analysis is invariant across all validation decisions taken by the first, second, and third validation planes.

**Claim 4.** A computer-implemented method for transparent security-triggered agent session rotation in a large language model deployment, comprising:

(a) detecting a behavioral anomaly in a running agent container session by comparing a structural hash of a normalized agent output against a content-addressed behavioral registry of pre-approved output hashes;

(b) serializing the current session context comprising the full conversation history as a JSON array of message objects, an accumulated provenance risk score computed as a monotonically non-decreasing function of detected input anomalies, and agent state vectors;

(c) encrypting the serialized session context using ChaCha20-Poly1305 with a per-session encryption key derived from a master key using HKDF-SHA256 with the session identifier as salt;

(d) sealing the current session by computing a chain hash as SHA-256 of the concatenation of a payload hash of the encrypted serialized session content and the chain hash of the immediately preceding sealed session, and writing the sealed entry to an append-only forensic archive;

(e) initiating a CRIU checkpoint operation on the current agent container and provisioning a replacement shadow container from the same base image;

(f) restoring the checkpoint image into the shadow container and injecting the encrypted serialized session context as an immutable boot-time parameter;

(g) transferring agent-facing network endpoints to the shadow container and terminating the original container;

wherein the replacement container decrypts the injected context, reconstructs the conversation history, initializes its security evaluation state from the injected provenance risk score, and resumes the user-facing conversation without producing any signal perceptible to the user or the replacement agent indicating that a session rotation occurred; and

wherein the sealing and rotation are triggered exclusively by security integrity events originating from the second validation plane's hash comparison, not by availability or reliability events.

**Claim 7.** A computer-implemented method for preventing timing side-channel detection of validation actions in a large language model inference pipeline operating at aggregate throughput exceeding ten billion floating-point operations per second, comprising:

(a) measuring a statistical baseline latency distribution for a plurality of approved agent outputs by recording delivery timestamps at the egress point of a transparent validation proxy across a sliding sample window of at least one thousand sequential approved outputs;

(b) computing a target variance bound from the 99th percentile of said statistical baseline distribution, defining an acceptable delivery timing window as the interval from three standard deviations below the distribution mean to the 99th percentile latency value;

(c) for each agent output subject to a validation discard decision, computing a normalization delay value drawn from said statistical baseline distribution using inverse transform sampling applied to a uniform random variable, such that total output delivery latency comprising validation processing time plus normalization delay falls within the target variance bound regardless of whether the output was approved or discarded;

(d) delivering the normalization delay via a hardware-accelerated timer on the egress proxy host, the hardware-accelerated timer being a high-resolution POSIX timer or hardware performance counter interrupt, thereby preventing OS scheduling jitter from creating a secondary distinguishable timing signal;

whereby an agent process or external observer using response latency as a signal to detect validation actions cannot distinguish approved outputs from discarded outputs based on timing analysis alone.

### Dependent Claims

**Claim 2.** The system of Claim 1, wherein the content-addressed behavioral registry stores agent scripts, tool-call schemas, system prompts, and approved output hashes, each indexed by the SHA-256 hash of their canonical serialized content; a mutable alias pointer table maps human-readable script identifiers to current content hashes; the continuous integration/continuous deployment pipeline is the exclusive authorized writer to the registry via Ed25519 signature verification against a known public key; agent execution environments fetch scripts exclusively by content hash; no runtime execution path exists for inserting, modifying, or deleting artifacts in the registry outside the authorized deployment pipeline; and the content store is append-only, with entries written once and never modified or deleted, converting agent behavioral scope from a dynamic attack surface to a static auditable artifact set.

**Claim 3.** The system of Claim 1, further comprising a telemetry bus implemented as a unidirectional event channel using a Unix domain socket or shared memory ring buffer, the telemetry bus receiving structured event records from the first, second, and third validation planes, each event record comprising a validation plane identifier, event type, timestamp, session identifier, and plane-specific metadata; routing events to a policy enforcement module for asynchronous evaluation; wherein policy enforcement decisions modify threshold parameters of the first validation plane via a separate shared-memory configuration structure readable by the eBPF programs, without producing any signal observable to the agent process, enabling adaptive security response without creating a detectable feedback channel.

**Claim 5.** The method of Claim 4, wherein the accumulated provenance risk score is initialized to zero at session start and incremented by a taint contribution weight for each detected input anomaly, the taint contribution weights being drawn from a threat taxonomy comprising at least PROMPT_INJECTION, PII_EXFILTRATION_ATTEMPT, COMMAND_INJECTION, and POLICY_VIOLATION categories; the accumulated provenance risk score is bounded above at 1.0 and never decremented within a session; the accumulated provenance risk score is included in the boot-time context payload injected into the replacement agent container; and the replacement container initializes its security evaluation state and first validation plane taint thresholds from the injected provenance risk score rather than from default initial values; whereby an adversarial agent cannot reset accumulated risk state by triggering a session rotation event.

**Claim 6.** The method of Claim 4, wherein the append-only forensic archive is implemented as a database table with row-level security policies granting INSERT privileges to an archive writer role held by the container lifecycle manager, SELECT privileges to the agent execution role, and no UPDATE or DELETE privileges to any role other than a dedicated archive-admin role with human-only access; each sealed session entry stores a session identifier, a payload hash, a chain hash computed as SHA-256(payload_hash || prev_chain_hash) linking to the immediately preceding entry, a sealed timestamp, and an encrypted payload blob; the first entry uses a well-known genesis hash constant as the prev_chain_hash; and the replacement container verifies archive integrity by recomputing and comparing chain hashes of all entries since a known-good anchor before initializing from injected context, rejecting initialization and raising a forensic integrity alert if any recomputed chain hash does not match the stored value.

**Claim 8.** The method of Claim 7, applied to an email attachment processing pipeline, further comprising:

(a) for each received email attachment, spawning a new isolated container execution environment from a clean base image whose SHA-256 digest matches a registry entry, said container having no network access via iptables DROP rules on the container's default gateway, no persistent storage outside an in-memory tmpfs working directory with a configured size limit, and a maximum execution lifetime of thirty seconds enforced by a systemd transient unit or cgroup timeout;

(b) executing content extraction operations on the attachment within said container using content-extraction libraries isolated from the agent process;

(c) capturing a structured output record comprising extracted text content, detected MIME type, and classification labels;

(d) destroying the container execution environment via SIGKILL upon extraction completion or lifetime expiration, whichever occurs first;

wherein no container instance is reused across attachment processing invocations, the container is provisioned from a fresh or verified-clean image for each invocation, and validation actions taken on attachment content produce no observable signal to the email-sending agent, eliminating cross-attachment state persistence as a class of container fingerprinting attack surface.

**Claim 9.** The method of Claim 8, further comprising:

(a) an email egress container holding exclusive SMTP credentials for outbound email transmission, said credentials stored in a kernel-level secrets store accessible only within the egress container's process namespace via a kernel keyring entry accessible only to the mailer process PID;

(b) network namespace enforcement routing all outbound TCP connections on SMTP ports 25, 465, and 587 exclusively through the egress container's network namespace via iptables REDIRECT rules;

(c) a data loss prevention scan module co-located in the egress container that evaluates outbound message content against a configurable rule set comprising regular expression patterns for PII types, keyword lists for confidential document classification labels, attachment content hash comparison against a known-sensitive-content registry, and structural analysis of recipient lists for external domain routing;

(d) a DKIM signing module co-located in the egress container that applies an RSA-2048 or Ed25519 cryptographic domain signature to each outbound message body and selected headers;

(e) a rate limiting module co-located in the egress container enforcing per-recipient and per-session transmission limits using a token bucket algorithm;

wherein the structural co-location of the DLP scan module, DKIM signing module, and rate limiting module in the sole SMTP-credentialed container ensures that any code path that transmits an outbound email must pass through all three enforcement modules, making bypass of any individual module structurally equivalent to bypass of all modules simultaneously, and wherein the egress container operates with a reduced Linux capability set and seccomp-BPF filter with network access limited to the designated SMTP relay host.

**Claim 10.** The method of Claim 9, wherein evaluation of inbound email messages further comprises:

(a) parsing each received email message to extract authentication result fields including SPF, DKIM, and DMARC verification results, and message routing fields including Received headers, Reply-To, and X-Mailer;

(b) assigning a fractional risk score to each detected header anomaly type from a pre-defined scoring table wherein each anomaly type is assigned a score in the range (0, 1), the scoring table comprising at least SPF_FAIL, DKIM_FAIL, DMARC_FAIL, RECEIVED_FROM_MISMATCH, REPLY_TO_REDIRECT, X_MAILER_SUSPICIOUS, EXCESSIVE_ROUTING_HOPS, and TIMESTAMP_ANOMALY;

(c) summing fractional anomaly scores for all detected anomalies in a single message to produce a per-message header risk contribution;

(d) retrieving an accumulated risk state for the email session associated with the message, the email session being defined as the set of messages from a given sender address or sender IP range within a sliding time window;

(e) adding the per-message header risk contribution to the accumulated session risk;

(f) computing an effective risk threshold as T_effective = T_base - (k * n_flagged), where T_base is a configurable base threshold, k is a configurable penalty coefficient, and n_flagged is the count of prior messages in the session whose per-message contribution exceeded a configurable minimum-significance floor;

(g) taking a security enforcement action if the updated accumulated session risk exceeds the effective risk threshold;

whereby a sender whose individual messages fall below per-message detection thresholds is subject to increasing scrutiny as anomalous messages accumulate across the session, defeating incremental adversarial probing strategies that exploit per-message threshold evaluation.

---

## 9. ABSTRACT

A closed-loop integrity system for large language model (LLM) agent deployments comprising three cooperating validation planes that enforce behavioral constraints without producing observable enforcement signals to the monitored agent process. A first validation plane implements kernel-level eBPF taint-tracking that intercepts and sanitizes agent inputs at the syscall level using tokenizer-aligned adversarial threat taxonomy classification, with enforcement via syscall return value rewriting that produces no observable error to the agent process. A second validation plane implements a structural hash verifier that normalizes agent outputs, computes SHA-256 hashes, and compares them against a content-addressed behavioral registry written exclusively via a CI/CD pipeline gated by Ed25519 signature verification, delivering synthetic plausible responses upon hash mismatch. A third validation plane implements a checkpoint-restore container lifecycle manager that performs transparent session rotation via CRIU migration upon hash mismatch, propagating accumulated adversarial provenance risk scores into replacement containers so that session rotation cannot be exploited as a risk-state reset. A latency normalization method using hardware-accelerated timing delays drawn from a statistically-sampled baseline delivery distribution prevents timing side-channel detection of enforcement decisions. Email attachment sandboxing via ephemeral no-reuse containers, egress-only mailer container with structurally co-located SMTP credentials, DLP scanning, DKIM signing, and rate limiting, and fractional header risk scoring with dynamic threshold reduction detect and enforce against incremental adversarial email campaigns.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-020
