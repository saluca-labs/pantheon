# Requirements: Tiresias Production Monitoring & Drift Detection

**Defined:** 2026-03-19
**Core Value:** Real-time awareness of infrastructure state and security posture — if something drifts, breaks, or gets probed, we know immediately and the response chain is automated.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Tiresias monitoring container deployed on agent-net bridge with 512MB hard memory limit
- [ ] **FOUND-02**: Pydantic event schema covering drift events, security events, health events, and LLM observability events
- [ ] **FOUND-03**: Dead man's switch — external heartbeat that alerts via Telegram if Tiresias container stops responding
- [ ] **FOUND-04**: YAML baseline schema with jsonschema validation for declaring expected infrastructure state
- [ ] **FOUND-05**: One-directional baseline sync from git YAML to Supabase operational layer (git is authoritative)
- [ ] **FOUND-06**: structlog-based logging pipeline pushing structured events to Grafana Cloud Loki
- [ ] **FOUND-07**: CISO documentation — threat model (STRIDE), compliance mapping (SOC 2 / NIST CSF / ISO 27001), automation requirements matrix

### Drift Detection

- [ ] **DRIFT-01**: Docker collector using Docker SDK 7.1.0 — captures container state, resource usage, network config, image versions
- [ ] **DRIFT-02**: Declarative baseline comparison using DeepDiff 8.6.1 — compares declared YAML state against actual Docker/system state
- [ ] **DRIFT-03**: Safe vs unsafe drift classification — known-safe drift (e.g. expected restart) vs unknown/dangerous drift
- [ ] **DRIFT-04**: Event-driven real-time detection via Docker events API for container lifecycle changes
- [ ] **DRIFT-05**: 60-minute reconciliation scans comparing full declared baseline against actual state
- [ ] **DRIFT-06**: Supabase audit trail for all drift events with timestamps, source, classification, and resolution status
- [ ] **DRIFT-07**: Infrastructure baseline declarations for all Saluca infra — GCP services, Docker containers, Supabase tables, vault keys, DNS, certs
- [ ] **DRIFT-08**: Auto-remediation for known-safe drift with circuit breaker (max 3 auto-fixes per hour, then alert human)

### Security Monitoring

- [ ] **SEC-01**: Auth failure detection — correlate 3+ failures in 5 minutes from same source IP, alert via Telegram
- [ ] **SEC-02**: Endpoint health probes — HTTP/TCP checks against all public services (OAuth proxy, webhook:8767, voice:8765, MCP endpoint)
- [ ] **SEC-03**: Certificate expiry monitoring — daily check, alert at 14 days before expiry
- [ ] **SEC-04**: Caddy access log parsing — structured extraction of request patterns, status codes, source IPs
- [ ] **SEC-05**: Port scan detection — alert when >10 ports probed in 60 seconds from same source
- [ ] **SEC-06**: Rate anomaly detection — alert when request rate to any endpoint exceeds 3x baseline average
- [ ] **SEC-07**: Cross-agent hash verification — validate agent_context_hashes chain integrity on every reconciliation scan
- [ ] **SEC-08**: Response playbook per detection rule — documented action for each alert type (block, investigate, escalate)

### LLM Observability

- [ ] **LLM-01**: LLM request/response traffic logging — capture prompt, response, model, tokens, latency for all proxy traffic
- [ ] **LLM-02**: Token consumption tracking — per-model, per-endpoint usage with anomaly detection (>2x daily average)
- [ ] **LLM-03**: Prompt injection detection — classify incoming prompts using rule-based detection, auto-block confirmed injections
- [ ] **LLM-04**: PII detection on LLM streams — async analysis of request/response content, redact-and-alert (not inline blocking)
- [ ] **LLM-05**: Request classification — categorize LLM requests by intent (chat, code, search, tool-use) for routing observability
- [ ] **LLM-06**: Health-aware routing observability — monitor circuit breaker states, provider health scores, failover events

### Alerting & Response

- [ ] **ALERT-01**: Telegram alerting pipeline — severity-routed messages (CRITICAL: immediate, WARNING: batched hourly, INFO: daily digest)
- [ ] **ALERT-02**: Structured event logging to Grafana Cloud Loki — all events queryable with LogQL
- [ ] **ALERT-03**: Supabase incident records — full audit trail with event type, timestamp, source, severity, resolution status, responder
- [ ] **ALERT-04**: Alert deduplication — suppress duplicate alerts for the same event within a configurable window (default 15 min)
- [ ] **ALERT-05**: Graduated alert escalation — if WARNING unresolved for 2 hours, escalate to CRITICAL

## v2 Requirements

### Enterprise Hardening

- **ENT-01**: Docker socket proxy (Tecnativa) for API access restriction
- **ENT-02**: TLS for all inter-container communication on agent-net
- **ENT-03**: Multi-zone deployment reference architecture documentation
- **ENT-04**: RBAC for monitoring configuration changes
- **ENT-05**: Supabase row retention/archival strategy for long-term audit trails

### Advanced Detection

- **ADV-01**: ML-based anomaly detection trained on baseline traffic patterns
- **ADV-02**: IP reputation integration for known-malicious source enrichment
- **ADV-03**: Container image vulnerability scanning integration with Trivy
- **ADV-04**: Behavioral profiling — detect unusual LLM usage patterns per user/agent

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full SIEM platform | Grafana Loki + Supabase provide log aggregation and structured storage. Building another SIEM adds complexity without value. |
| Custom dashboards | Grafana Cloud handles visualization. Tiresias provides data, not UI. |
| Vulnerability scanning engine | Kali sidecar has nmap, nuclei, subfinder installed. Use existing tools. |
| Multi-cloud inventory | Single GCP VM environment. Multi-cloud adds complexity for zero current value. |
| Brief→reMarkable fix | Separate project — existing alfred plumbing repair, not monitoring capability. |
| Mobile/desktop alert apps | Telegram is the personal channel. Enterprise SIEM channels already in Tiresias product. |
| Passive network sniffing | Docker bridge doesn't support it without NET_ADMIN privilege escalation. Active probing is the correct pattern. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| FOUND-07 | Phase 1 | Pending |
| DRIFT-01 | Phase 2 | Pending |
| DRIFT-02 | Phase 2 | Pending |
| DRIFT-03 | Phase 2 | Pending |
| DRIFT-04 | Phase 2 | Pending |
| DRIFT-05 | Phase 2 | Pending |
| DRIFT-06 | Phase 2 | Pending |
| DRIFT-07 | Phase 2 | Pending |
| DRIFT-08 | Phase 2 | Pending |
| SEC-01 | Phase 3 | Pending |
| SEC-02 | Phase 3 | Pending |
| SEC-03 | Phase 3 | Pending |
| SEC-04 | Phase 3 | Pending |
| SEC-05 | Phase 3 | Pending |
| SEC-06 | Phase 3 | Pending |
| SEC-07 | Phase 3 | Pending |
| SEC-08 | Phase 3 | Pending |
| LLM-01 | Phase 4 | Pending |
| LLM-02 | Phase 4 | Pending |
| LLM-03 | Phase 4 | Pending |
| LLM-04 | Phase 4 | Pending |
| LLM-05 | Phase 4 | Pending |
| LLM-06 | Phase 4 | Pending |
| ALERT-01 | Phase 2 | Pending |
| ALERT-02 | Phase 1 | Pending |
| ALERT-03 | Phase 2 | Pending |
| ALERT-04 | Phase 3 | Pending |
| ALERT-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
