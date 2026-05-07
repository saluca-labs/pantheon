# Research Summary: Tiresias Production Monitoring & Drift Detection

**Domain:** Infrastructure monitoring, drift detection, security observability
**Researched:** 2026-03-19
**Overall confidence:** HIGH

## Executive Summary

The standard 2025/2026 stack for infrastructure drift detection and security monitoring is dominated by heavy platforms (Wazuh at 6GB+ RAM, Elastic SIEM at 4GB+ heap, Prometheus+Grafana at 500MB+) that are completely incompatible with a single GCP VM running Docker containers under a 4GB memory constraint. The right approach for this environment is a custom lightweight Python monitoring appliance that leverages existing infrastructure (Grafana Cloud Loki for logs, Supabase for structured data, Telegram for alerts) rather than deploying another platform.

The core technical insight is that drift detection at this scale is a solved problem with commodity Python libraries: PyYAML for declarative baselines, DeepDiff 8.6.1 for state comparison, the Docker SDK 7.1.0 for container inspection, and APScheduler 3.11.x for scheduling. No exotic tools are needed. The differentiation comes from the integration -- combining drift detection, security monitoring, and LLM-aware observability in a single container that models an enterprise network appliance deployment.

The architecture follows the standard SIEM collector-normalizer-correlator-dispatcher pipeline, adapted for single-container deployment with in-process communication (asyncio queues instead of message brokers). Security detection rules are plain Python functions, not a DSL, making them testable with pytest and maintainable by the same team that writes the monitoring code. The Tiresias container joins the existing Docker bridge network as a read-only observer -- it queries the Docker API and probes endpoints but never modifies infrastructure.

The critical constraint is memory: the Tiresias container must fit within 256-512MB alongside existing containers. This rules out every off-the-shelf SIEM and most observability stacks. The recommended stack (Python + Pydantic + DeepDiff + Docker SDK + httpx + structlog + APScheduler) has an estimated memory footprint of 150-250MB, well within budget.

## Key Findings

**Stack:** All-Python stack using Pydantic for models, DeepDiff 8.6.1 for drift comparison, Docker SDK 7.1.0 for container inspection, APScheduler 3.11.x for scheduling, httpx for async probes, structlog for Loki-compatible logging. No new infrastructure services required.

**Architecture:** Single-container network appliance on agent-net bridge. Collector-normalizer-correlator-dispatcher SIEM pipeline with in-process event bus. Read-only monitoring posture with separate remediation service for safe-drift auto-fixes.

**Critical pitfall:** Resource contention -- the monitoring container must have hard memory limits (512MB max) to avoid OOM-killing production services. The second critical pitfall is the bootstrap paradox: when Tiresias dies, no alerts fire because the alerting system IS Tiresias. A dead man's switch (external heartbeat) is mandatory from day one.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Event Schema + Baselines + Container** - Build the event data model, YAML baseline schema with jsonschema validation, baseline-to-Supabase sync, and the Tiresias Docker container with resource limits.
   - Addresses: Declarative baseline system, container deployment
   - Avoids: Resource contention (hard limits from day one), baseline rot (schema validation prevents malformed baselines)

2. **Drift Detection Engine** - Docker collector, drift scanner with DeepDiff comparison, safe/unsafe classification, Telegram alerting, Supabase audit trail.
   - Addresses: Continuous drift scanning, drift classification, alerting, audit trail
   - Avoids: Scanner state mutation (whitelist scanner identity), I/O overhead (event-driven + periodic reconciliation hybrid)

3. **Security Monitoring** - Caddy log parsing, auth failure detection rules, endpoint health probes, certificate expiry monitoring, correlation engine.
   - Addresses: Security telemetry, auth failure detection, health monitoring, cert monitoring
   - Avoids: Alert fatigue (start with 3 rules max, severity-based routing), detection-response gap (playbook required per rule)

4. **Advanced Detection & Remediation** - Safe-drift auto-remediation, LLM traffic monitoring, prompt injection detection, PII detection, cross-agent hash verification.
   - Addresses: Auto-remediation, LLM observability, Tiresias integration
   - Avoids: PII false positives (30-day silent logging before alerting), remediation loops (circuit breaker on auto-fixes)

**Phase ordering rationale:**
- Phase 1 before everything because all components depend on the event schema and baseline format
- Phase 2 before Phase 3 because drift detection is the core value proposition and validates the collection pipeline
- Phase 3 before Phase 4 because security monitoring requires proven collection and alerting infrastructure
- Phase 4 last because LLM-specific features require data from Phases 2-3 and are the highest complexity

**Research flags for phases:**
- Phase 2: Standard patterns (DeepDiff + Docker SDK), unlikely to need deeper research
- Phase 3: May need research on Caddy log format specifics and fail2ban Docker integration patterns
- Phase 4: Likely needs deeper research on prompt injection detection approaches and PII classification for LLM traffic

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended libraries are production-stable with verified versions from PyPI. No alpha/beta dependencies. |
| Features | HIGH | Feature landscape well-mapped against existing tools (Wazuh, Falco, Datadog LLM Obs). Clear table-stakes vs differentiator distinction. |
| Architecture | HIGH | SIEM collector-normalizer-correlator pipeline is battle-tested. Docker bridge networking constraints verified. Agentless monitoring via Docker API is standard practice. |
| Pitfalls | HIGH | Resource contention, bootstrap paradox, and alert fatigue are the three most common monitoring deployment failures. All have concrete mitigations. |
| Memory estimates | MEDIUM | Based on component-level estimates, not measured. Actual memory usage should be profiled during Phase 1. |

## Gaps to Address

- **Caddy log format:** Exact format of Caddy access logs on the GCP VM needs verification during Phase 1. Parsing logic depends on whether structured JSON logging is enabled.
- **Docker socket proxy:** For enterprise hardening, Tecnativa/docker-socket-proxy should be evaluated to restrict Docker API access. Not needed for Phase 1 but should be researched for later phases.
- **Supabase row limits:** Long-term audit trail growth in Supabase needs a retention/archival strategy. Not urgent but should be planned before Phase 3.
- **LLM proxy architecture:** How to intercept LLM request/response traffic without modifying existing services needs research before Phase 4. Options include reverse proxy, middleware injection, or log-based analysis.
- **fail2ban + Docker specifics:** The interaction between fail2ban, Docker networking, and iptables has known gotchas. Needs testing before deploying IP banning in Phase 3.
