# Feature Research

**Domain:** Infrastructure drift detection, security monitoring, and LLM-aware observability
**Researched:** 2026-03-19
**Confidence:** HIGH (drift/security features well-established), MEDIUM (LLM-specific monitoring is emerging)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make the system functional. Without these, the monitoring platform has no value.

#### Workstream 1: Drift Detection

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Declarative baseline definitions (YAML) | Every drift tool (Terraform, AWS Config, driftctl) compares against declared state. No baseline = no drift detection. | MEDIUM | Git-versioned YAML files. PROJECT.md already specifies dual-layer (git YAML + Supabase). Follow that decision. |
| Continuous drift scanning | AWS Config runs continuously; Terraform Cloud checks every hour. 2-day cron (current alfred_audit.py) misses too much. 5-min intervals per PROJECT.md. | MEDIUM | Must be lightweight -- compare declared state to actual via API/CLI checks. Not full infra re-provisioning. |
| Drift event logging with timestamps | Every tool in this space (AWS Config, CloudQuery, Steampipe) produces timestamped audit records. Non-negotiable for compliance. | LOW | Write to Supabase table with timestamp, resource, expected_value, actual_value, severity. |
| Alerting on detected drift | AWS Config sends SNS notifications; Terraform Cloud sends Slack/email. Any monitoring without alerting is useless. | LOW | Telegram via existing Alfred bot integration. Already wired. |
| Safe vs unsafe drift classification | AWS Config has conformance packs (known-safe exceptions). Terraform Cloud distinguishes "expected" vs "unexpected" changes. Must triage, not just dump alerts. | MEDIUM | Rule-based classification: known-safe patterns (e.g., container restart = new PID) vs unknown changes. |
| Drift history and audit trail | AWS Config maintains configuration timeline. CloudQuery snapshots over time. Required for SOC 2 evidence. | LOW | Supabase table with immutable append-only records. Query by resource, time range, severity. |

#### Workstream 2: Security Monitoring

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auth failure monitoring | Wazuh, Falco, OSSEC all track failed authentication. Foundation of intrusion detection. | LOW | Parse Caddy/OAuth proxy logs for 401/403 responses. Correlate by source IP. |
| Rate limiting / abuse detection | Datadog, Cloudflare, every WAF does this. Public endpoints without rate awareness are blind. | MEDIUM | Track request rates per IP per endpoint. Threshold-based alerting (configurable). |
| Port scan detection | Falco, Wazuh, OSSEC all detect port scanning via connection pattern analysis. | MEDIUM | Analyze connection attempts to non-service ports. Threshold: >10 distinct ports in 60s per PROJECT.md. |
| Structured security event logging | Wazuh centralizes all security events. Falco outputs structured JSON. Non-negotiable for incident response. | LOW | Consistent JSON schema: timestamp, event_type, source_ip, target, severity, details. Write to Supabase + Loki. |
| Service health checks | Datadog, Grafana, Uptime Robot -- basic endpoint health is the minimum bar for any monitoring. | LOW | HTTP/TCP probes against all services. Track response time, status code, availability percentage. |
| Container state monitoring | osquery has 17 Docker tables. Falco monitors container runtime. Must know what containers are running and their state. | LOW | Docker API queries: container list, status, resource usage, network bindings. Compare against baseline. |

#### Workstream 3: Observability

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Request/response logging for LLM traffic | Datadog LLM Observability, Langfuse, and WhyLabs all capture full request/response pairs. Foundation for everything else. | MEDIUM | Intercept or proxy LLM API calls. Log prompt, response, tokens, latency, model, cost. |
| Token usage tracking | Every LLM observability tool (Langfuse, Helicone, Datadog) tracks token consumption. Cost control is non-negotiable. | LOW | Extract token counts from API responses. Aggregate by model, endpoint, time period. |
| Error rate monitoring | Standard observability (Grafana, Datadog). Must know when LLM calls are failing. | LOW | Track 4xx/5xx responses, timeouts, rate limits from LLM providers. |
| Latency tracking per model/endpoint | Standard observability metric. Health-aware routing is impossible without latency data. | LOW | Measure and record request-to-response time per model, per provider. |

### Differentiators (Competitive Advantage)

Features that make Tiresias distinct from generic monitoring. Especially strong where LLM-specific and AI-agent-specific monitoring are concerned -- this is an emerging space where most tools are immature.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Prompt injection detection on live traffic | Datadog added this in 2025 but it requires their full platform. WhyLabs and LLM Guard offer it standalone. Running this on your own proxy traffic with your own rules is a strong differentiator for an on-prem appliance. | HIGH | Semantic similarity against known jailbreak patterns + heuristic classification. Can start with regex patterns, graduate to embedding-based detection. |
| PII detection in LLM streams | WhyLabs and Langfuse offer this. Rare in self-hosted tools. Tiresias doing this on-prem without sending data to a third party is a genuine differentiator. | HIGH | Regex for structured PII (SSN, email, phone). Named entity recognition for unstructured PII. Must not add significant latency if inline. |
| Auto-remediation for safe drift | Terraform Cloud can auto-apply. Most drift tools only detect. Automated safe-drift remediation (restart container, re-apply config) with audit trail is a step beyond detection. | HIGH | Requires a remediation service with its own auth (per PROJECT.md read-only posture for Tiresias itself). Define safe-remediation playbooks in YAML. |
| Health-aware LLM routing visibility | New Relic's 2025 Agentic AI Monitoring does this for multi-agent systems. No self-hosted equivalent exists. Showing which LLM provider is healthy and how routing decisions are made is novel for on-prem. | MEDIUM | Dashboard over existing routing logic (alfred_openrouter.py). Track provider health scores, failover events, cost per route. |
| Cross-agent context verification | The agent_context_hashes table is already novel (confirmed by Perplexity novelty validation). Monitoring hash chain integrity as a security signal is unique. | MEDIUM | Verify hash chain continuity. Alert on gaps, tampering, or unexpected agents writing to the chain. |
| Credential probing detection | Beyond auth failures -- detecting patterns like credential stuffing, API key rotation probing, OAuth token replay. Wazuh does some of this but not LLM-API-specific. | MEDIUM | Correlate auth failures with request patterns: same source trying multiple API keys, sequential key values, known credential dump patterns. |
| LLM cost anomaly detection | Helicone and Langfuse track cost, but anomaly detection on token spend (sudden spike = possible prompt injection or recursive agent loop) is rare. | MEDIUM | Baseline normal token consumption per service. Alert on deviations beyond 2-3 standard deviations. Catches runaway agents and abuse. |
| Request classification (benign/suspicious/malicious) | Tiresias-specific capability. Classify incoming requests by intent, not just by HTTP status. Combines prompt injection detection with broader threat classification. | HIGH | Multi-label classifier: benign, recon, injection, abuse, credential_probe. Start rule-based, graduate to ML. |

### Anti-Features (Deliberately NOT Building)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full SIEM/log aggregation platform | "We need centralized logging" | Grafana Cloud Loki already handles this. Building a log aggregation engine is a multi-year effort. Wazuh and Elastic exist. | Ship structured events to existing Loki instance. Use Supabase for queryable incident records. Leave log storage to Loki. |
| Agent-based endpoint monitoring (install agents on every host) | "Wazuh/OSSEC model -- agent on every endpoint" | Single VM with Docker. Installing agents inside each container adds complexity, image bloat, and maintenance burden. Falco/osquery model of host-level monitoring is better for this scale. | Monitor from host level via Docker API and network traffic. One monitoring container observes all others. Network appliance model per PROJECT.md. |
| Custom dashboard/visualization platform | "Build our own Grafana" | Grafana already exists, is free, connects to Loki and Prometheus. Reimplementing visualization is pure waste. | Push metrics to Prometheus format. Use existing Grafana Cloud instance for visualization. Tiresias provides data, not dashboards. |
| Multi-cloud resource inventory | "Query all cloud resources like Steampipe/CloudQuery" | This is a single GCP VM. Multi-cloud inventory is irrelevant. Steampipe and CloudQuery solve this well for teams that need it. | Baseline the specific resources that exist (containers, services, network config, DNS, certs). No need for generic cloud API abstraction. |
| Real-time packet inspection / deep packet inspection | "Monitor all network traffic at packet level" | Massive performance overhead on a 4GB memory-limited host. Containers share a bridge network. Full DPI is overkill. | Monitor at the application layer: HTTP logs, Docker network events, connection metadata. Not packet payloads. |
| ML-based anomaly detection from day one | "Use AI to detect everything" | Requires months of baseline data to train meaningful models. Produces noisy false positives early. Datadog took years to get this right. | Start with rule-based detection with configurable thresholds. Collect data for future ML. Graduate to statistical anomaly detection (z-score) before ML. |
| Vulnerability scanning / CVE database | "Scan containers for CVEs like Trivy/Grype" | Excellent tools already exist (Trivy, Grype, Snyk). Building a CVE database and scanner from scratch is pointless. | Run Trivy scans via Kali sidecar on a schedule. Ingest results into Tiresias as security events. Don't rebuild the scanner. |
| Compliance framework certification engine | "Auto-certify SOC 2 / ISO 27001" | Compliance certification requires human auditors, process documentation, and organizational controls beyond technical monitoring. | Provide evidence collection (audit logs, drift records, security events) that supports compliance. Don't claim to automate certification itself. |

## Feature Dependencies

```
[Declarative Baselines (YAML)]
    |
    +--requires--> [Baseline-to-Supabase Sync]
    |                   |
    |                   +--enables--> [Continuous Drift Scanning]
    |                                     |
    |                                     +--enables--> [Safe vs Unsafe Classification]
    |                                     |                  |
    |                                     |                  +--enables--> [Auto-Remediation]
    |                                     |
    |                                     +--enables--> [Drift History / Audit Trail]
    |
[Structured Event Logging Schema]
    |
    +--enables--> [Auth Failure Monitoring]
    +--enables--> [Rate Limiting Detection]
    +--enables--> [Port Scan Detection]
    +--enables--> [Credential Probing Detection]
    +--enables--> [All Alerting]
    |
[LLM Request/Response Logging]
    |
    +--enables--> [Token Usage Tracking]
    +--enables--> [Latency Tracking]
    +--enables--> [Prompt Injection Detection]
    +--enables--> [PII Detection]
    +--enables--> [LLM Cost Anomaly Detection]
    +--enables--> [Request Classification]
    +--enables--> [Health-Aware Routing Visibility]
    |
[Service Health Checks]
    +--enables--> [Health-Aware Routing Visibility]
    +--enables--> [Circuit Breaker Monitoring]
    |
[Container State Monitoring]
    +--enhances--> [Drift Scanning] (container state is part of baseline)
    +--enhances--> [Security Event Correlation] (container context for alerts)
```

### Dependency Notes

- **Declarative Baselines required first:** Everything in drift detection depends on having a baseline to compare against. This is Phase 1 work.
- **Structured Event Logging is the foundation for all security monitoring:** Without a consistent event schema, correlation and alerting are impossible. Define the schema before building detectors.
- **LLM Request/Response Logging gates all LLM-specific features:** Prompt injection detection, PII detection, cost anomaly detection, and request classification all need access to the actual request/response data. The logging/proxy layer must exist first.
- **Auto-remediation depends on classification:** You must be able to distinguish safe from unsafe drift before automating remediation. Classification comes before action.
- **Health checks enable routing visibility:** You cannot show health-aware routing decisions without knowing provider health state.

## MVP Definition

### Launch With (v1)

Minimum viable monitoring -- proves the system works and provides immediate value.

- [ ] Declarative baseline YAML for all Saluca infrastructure (containers, services, network, DNS, certs)
- [ ] Baseline-to-Supabase sync (one-directional, git authoritative)
- [ ] Continuous drift scanner (5-min intervals) comparing baseline to reality
- [ ] Safe/unsafe drift classification with rule-based triage
- [ ] Structured security event schema and logging to Supabase + Loki
- [ ] Auth failure monitoring on public endpoints (Caddy/OAuth proxy logs)
- [ ] Service health checks for all services (HTTP/TCP probes)
- [ ] Container state monitoring via Docker API
- [ ] Telegram alerting for all detected events
- [ ] Drift history audit trail in Supabase

### Add After Validation (v1.x)

Features to add once the core scanning and alerting loop is proven reliable.

- [ ] Auto-remediation for safe drift -- trigger: consistently detecting safe drift that requires manual fix
- [ ] Rate limiting / abuse detection -- trigger: public endpoints receiving meaningful traffic
- [ ] Port scan detection -- trigger: Kali validation confirms external probe attempts
- [ ] LLM request/response logging (proxy or instrumentation layer)
- [ ] Token usage and cost tracking per model/endpoint
- [ ] Latency tracking and error rate monitoring for LLM calls
- [ ] Cross-agent context hash chain verification
- [ ] Credential probing detection (correlate auth failures with patterns)

### Future Consideration (v2+)

Features that require v1 data collection or are high complexity.

- [ ] Prompt injection detection on live LLM traffic -- requires LLM logging infrastructure from v1.x
- [ ] PII detection in LLM request/response streams -- requires LLM logging infrastructure
- [ ] Health-aware LLM routing visibility dashboard -- requires latency + health data from v1.x
- [ ] LLM cost anomaly detection -- requires baseline consumption data from weeks of v1.x logging
- [ ] Request classification (benign/suspicious/malicious) -- start rule-based, needs event data
- [ ] Circuit breaker monitoring integration with Grafana

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Declarative baselines (YAML) | HIGH | MEDIUM | P1 |
| Baseline-to-Supabase sync | HIGH | LOW | P1 |
| Continuous drift scanning | HIGH | MEDIUM | P1 |
| Safe/unsafe drift classification | HIGH | MEDIUM | P1 |
| Structured event logging schema | HIGH | LOW | P1 |
| Auth failure monitoring | HIGH | LOW | P1 |
| Service health checks | HIGH | LOW | P1 |
| Container state monitoring | HIGH | LOW | P1 |
| Telegram alerting | HIGH | LOW | P1 |
| Drift history audit trail | MEDIUM | LOW | P1 |
| Auto-remediation (safe drift) | HIGH | HIGH | P2 |
| Rate limiting detection | MEDIUM | MEDIUM | P2 |
| Port scan detection | MEDIUM | MEDIUM | P2 |
| LLM request/response logging | HIGH | MEDIUM | P2 |
| Token usage tracking | MEDIUM | LOW | P2 |
| Cross-agent hash verification | MEDIUM | LOW | P2 |
| Credential probing detection | MEDIUM | MEDIUM | P2 |
| Prompt injection detection | HIGH | HIGH | P3 |
| PII detection | HIGH | HIGH | P3 |
| Health-aware routing visibility | MEDIUM | MEDIUM | P3 |
| LLM cost anomaly detection | MEDIUM | MEDIUM | P3 |
| Request classification | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- system is useless without these
- P2: Should have, add once core loop is validated
- P3: Nice to have, requires P2 data collection first

## Competitor Feature Analysis

| Feature | AWS Config / Terraform Cloud | Wazuh / Falco | Datadog LLM Obs | Tiresias Approach |
|---------|------------------------------|---------------|------------------|-------------------|
| Drift detection | Continuous, cloud-native, massive resource coverage | N/A (not their focus) | N/A | Declarative YAML baselines scanned against Docker/service reality. Smaller scope, deeper for single-VM Docker. |
| Security event correlation | AWS Config Rules + CloudTrail | Wazuh: full SIEM with correlation engine. Falco: syscall-level runtime rules. | N/A | Lightweight correlation: auth failures + IP + timing. No full SIEM -- events to Loki + Supabase. |
| Container monitoring | Limited (ECS/EKS focused) | Falco: eBPF syscall monitoring. Wazuh: agent in container. | N/A | Docker API from host. Network appliance model -- no agents inside containers. Simpler than Falco, appropriate for single-host. |
| LLM traffic analysis | N/A | N/A | Full auto-instrumentation for OpenAI/Anthropic/Bedrock. Prompt injection scanner. | Proxy/instrumentation layer for our own traffic. Self-hosted, no data leaves the network. Key differentiator vs Datadog. |
| Prompt injection detection | N/A | N/A | Semantic similarity + known jailbreak DB | Rule-based first, semantic similarity later. On-prem advantage: data never leaves. |
| PII detection | N/A (Macie for S3 only) | N/A | Limited | On-prem regex + NER on LLM streams. Data sovereignty advantage. |
| Auto-remediation | Terraform auto-apply. AWS Config auto-remediation via SSM. | Wazuh active response (block IP, kill process). | N/A | Safe-drift playbooks with separate remediation service. Read-only monitoring + write-capable remediation = defense in depth. |
| Cost | AWS Config: $0.003/evaluation. Terraform Cloud: $0.00014/resource/hr. | Wazuh: free (self-hosted). Falco: free. | Datadog: $$$$ (enterprise pricing). | Free (self-hosted). Leverages existing Grafana Cloud free tier, Supabase, Telegram. |

## Sources

- [Terraform Drift Detection - HashiCorp](https://developer.hashicorp.com/terraform/tutorials/state/resource-drift)
- [Terraform Cloud Drift and Policy](https://developer.hashicorp.com/terraform/tutorials/cloud/drift-and-policy)
- [Spacelift Terraform Drift Detection Guide](https://spacelift.io/blog/terraform-drift-detection)
- [Config Drift Detection Open Source Tools 2025](https://www.ai-infra-link.com/mastering-config-drift-detection-top-open-source-tools-for-2025/)
- [Wazuh and Falco Integration](https://wazuh.com/blog/cloud-native-security-with-wazuh-and-falco/)
- [Falco - Sysdig](https://www.sysdig.com/opensource/falco)
- [Datadog LLM Prompt Injection Monitoring](https://www.datadoghq.com/blog/monitor-llm-prompt-injection-attacks/)
- [LLM Observability Tools 2026 Comparison](https://lakefs.io/blog/llm-observability-tools/)
- [LLM Security Tools 2025](https://nexos.ai/blog/llm-security-tools/)
- [OWASP LLM Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [Steampipe vs CloudQuery](https://www.cloudquery.io/blog/steampipe-vs-cloudquery)
- [osquery for Container Security](https://www.uptycs.com/blog/get-started-using-osquery-for-container-security)
- [Grafana 12 Release](https://grafana.com/blog/2025/05/07/grafana-12-release-all-the-new-features/)
- [Langfuse Security and Guardrails](https://langfuse.com/docs/security-and-guardrails)
- [NeuralTrust Prompt Injection Detection](https://neuraltrust.ai/blog/prompt-injection-detection-llm-stack)

---
*Feature research for: Tiresias Production Monitoring and Drift Detection*
*Researched: 2026-03-19*
