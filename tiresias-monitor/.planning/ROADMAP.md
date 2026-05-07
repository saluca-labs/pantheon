# Roadmap: Tiresias Production Monitoring & Drift Detection

## Overview

This roadmap delivers a lightweight production monitoring appliance for Saluca infrastructure in four phases. Phase 1 lays the foundation -- container deployment, event schemas, YAML baselines, dead man's switch, and logging pipeline. Phase 2 builds the core drift detection engine with Docker collection, baseline comparison, classification, alerting, and auto-remediation. Phase 3 adds security monitoring across all public endpoints with detection rules, log parsing, and escalation. Phase 4 caps with LLM-specific observability including traffic logging, token tracking, prompt injection detection, and PII analysis.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Container, event schemas, YAML baselines, dead man's switch, logging pipeline, CISO docs
- [ ] **Phase 2: Drift Detection** - Docker collection, baseline comparison, drift classification, alerting pipeline, audit trail, auto-remediation
- [ ] **Phase 3: Security Monitoring** - Endpoint probes, auth failure detection, log parsing, cert monitoring, detection rules, alert dedup and escalation
- [ ] **Phase 4: LLM Observability** - Traffic logging, token tracking, prompt injection detection, PII detection, request classification, routing observability

## Phase Details

### Phase 1: Foundation
**Goal**: Tiresias container is running on the network, can emit structured events, validates infrastructure baselines, and alerts if it dies
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, ALERT-02
**Success Criteria** (what must be TRUE):
  1. Tiresias container is running on agent-net bridge with a hard 512MB memory limit, queryable via Docker API
  2. A YAML baseline file declaring expected infrastructure state passes jsonschema validation and syncs one-directionally to Supabase
  3. Structured events (drift, security, health, LLM types) are logged to Grafana Cloud Loki and queryable with LogQL
  4. If the Tiresias container stops responding for 2+ minutes, an external heartbeat fires a Telegram alert (dead man's switch)
  5. CISO documentation exists covering STRIDE threat model, SOC 2 / NIST CSF / ISO 27001 compliance mapping, and automation requirements matrix
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Drift Detection
**Goal**: Infrastructure drift is detected in real-time and on a 60-minute cadence, classified as safe or unsafe, alerted via Telegram, logged to Supabase, and auto-remediated when safe
**Depends on**: Phase 1
**Requirements**: DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04, DRIFT-05, DRIFT-06, DRIFT-07, DRIFT-08, ALERT-01, ALERT-03
**Success Criteria** (what must be TRUE):
  1. When a Docker container changes state (start, stop, restart, config change), the drift engine detects it within seconds via the Docker events API and classifies it as safe or unsafe
  2. Every 60 minutes, a full reconciliation scan compares the declared YAML baseline against actual Docker/system state and reports all discrepancies
  3. Unsafe drift triggers an immediate Telegram alert with severity routing (CRITICAL: immediate, WARNING: batched hourly, INFO: daily digest)
  4. Known-safe drift is auto-remediated with a circuit breaker that stops after 3 auto-fixes per hour and escalates to human
  5. All drift events are recorded in Supabase with timestamp, source, classification, and resolution status -- forming a complete audit trail
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Security Monitoring
**Goal**: All public-facing endpoints are instrumented for threat detection with correlation rules, response playbooks, and graduated alert escalation
**Depends on**: Phase 2
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, ALERT-04, ALERT-05
**Success Criteria** (what must be TRUE):
  1. HTTP/TCP health probes run against all public services (OAuth proxy, webhook:8767, voice:8765, MCP endpoint) and alert on failure
  2. Auth failure correlation detects 3+ failures in 5 minutes from the same source IP and fires a Telegram alert
  3. Certificate expiry is checked daily and alerts at 14 days before expiry
  4. Caddy access logs are parsed into structured events with request patterns, status codes, and source IPs -- enabling port scan detection (>10 ports in 60s) and rate anomaly detection (>3x baseline)
  5. Duplicate alerts for the same event are suppressed within a 15-minute window, and WARNINGs unresolved for 2 hours escalate to CRITICAL
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: LLM Observability
**Goal**: All LLM proxy traffic is observed for cost, security, and routing health -- with prompt injection blocking, PII detection, and request classification
**Depends on**: Phase 3
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06
**Success Criteria** (what must be TRUE):
  1. LLM request/response traffic is logged with prompt, response, model, token count, and latency -- queryable in Loki and Supabase
  2. Token consumption is tracked per-model and per-endpoint, with alerts when usage exceeds 2x daily average
  3. Incoming prompts are classified for injection attempts using rule-based detection, and confirmed injections are auto-blocked with an alert
  4. PII in LLM request/response streams is detected asynchronously and triggers a redact-and-alert workflow (not inline blocking)
  5. LLM requests are classified by intent (chat, code, search, tool-use) and circuit breaker states, provider health scores, and failover events are observable
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Not started | - |
| 2. Drift Detection | 0/3 | Not started | - |
| 3. Security Monitoring | 0/3 | Not started | - |
| 4. LLM Observability | 0/2 | Not started | - |
