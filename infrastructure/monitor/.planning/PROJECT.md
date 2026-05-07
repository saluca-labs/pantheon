# Tiresias Production Monitoring & Drift Detection

## What This Is

The first production deployment of Tiresias as a networked security monitoring platform, deployed against Saluca's own infrastructure in an enterprise-modeled "on-prem" configuration. Combines three capabilities: a declarative drift detection engine that continuously reconciles expected vs actual infrastructure state, a security monitoring layer that instruments all public-facing endpoints for threat detection, and Tiresias self-hosting as the observability backbone — proving the product by eating our own cooking.

## Core Value

Real-time awareness of infrastructure state and security posture — if something drifts, breaks, or gets probed, we know immediately and the response chain is automated.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Declarative infrastructure baseline system (YAML in git + Supabase operational layer)
- [ ] Continuous drift scanner comparing declared state to reality across all Saluca infra
- [ ] Automated safe-drift remediation with alerting on unsafe drift
- [ ] Security telemetry on all public-facing endpoints (OAuth proxy, webhook, voice, MCP, Telegram bots)
- [ ] Threat detection rules: auth failures, prompt injection, credential probing, port scans, anomalous token consumption
- [ ] Tiresias deployed as networked appliance in enterprise-modeled on-prem configuration
- [ ] Health-aware LLM routing observability on our own proxy traffic
- [ ] Circuit breaker monitoring and request classification on live traffic
- [ ] PII detection on our own LLM request/response streams
- [ ] Telegram alerting pipeline for all monitoring events
- [ ] Audit trail of all detected events, drift resolutions, and security incidents in Supabase
- [ ] CISO-grade documentation: threat model, compliance mapping, automation requirements

### Out of Scope

- Fixing broken brief→reMarkable delivery chain — separate fix, not part of this project
- Building new Tiresias features — Tiresias is production-ready at tiresias.saluca.com; this deploys existing capability
- External customer onboarding workflows — this is internal dogfooding, not multi-tenant SaaS
- Mobile/desktop alerting apps — Telegram is the personal alert channel; enterprise SIEM channels already exist in Tiresias

## Context

### Existing Infrastructure

- **GCP VM (34.41.26.234)**: Hosts Alfred fleet (webhook:8767, monitor, voice:8765, alloy), Agent Zero (alfred.saluca.com), Kali sidecar, Qdrant
- **Tiresias**: Production-ready at tiresias.saluca.com — first networked deployment against real infrastructure
- **Supabase**: 30+ tables including service_health, alfred_logs, agent_context_hashes, tiresias_audit_log, tiresias_policies
- **Grafana Cloud Loki**: Already receiving logs via alfred_logger.py — detection rules and security telemetry are the gap
- **Existing monitoring**: alfred_audit.py (2-day cron, static scans + Perplexity queries), alfred_monitor (service health), agent_context_hashes (cross-agent state verification)
- **Kali sidecar**: nmap, nuclei, subfinder, hydra, etc. — available for active scanning and validation
- **Docker stack**: agent-zero, qdrant, kali, caddy on agent-net bridge network

### What's Missing

1. **No declared baseline**: Infrastructure was built organically — no single source of truth for "what should be true"
2. **No audit→resolution chain**: Audit findings don't automatically trigger fixes or tracked remediation
3. **No security telemetry**: Public endpoints aren't instrumented for threat detection
4. **No real-time awareness**: 2-day scan cadence misses drift that happens between windows
5. **No Tiresias in production**: The observability platform exists but has never monitored a real network

### Enterprise Model

This deployment models an enterprise on-prem installation. GCP VM is treated as the corporate data center. Tiresias deploys as a network appliance (dedicated container) rather than an embedded library. This creates a reference architecture for future enterprise customers.

## Constraints

- **Infrastructure**: Single GCP VM (34.41.26.234) with 4GB memory limit on agent-zero container. Tiresias container must coexist on same host without resource contention.
- **Security**: Least privilege — Tiresias monitors but cannot modify infrastructure. Read-only access to services, logs, and network traffic. Write access only to its own monitoring tables.
- **Cost**: Minimize external API costs. Use existing Grafana Cloud Loki (free tier), Supabase (existing project), and Telegram (free). No new paid services unless justified.
- **Credentials**: All secrets via _alfred_vault. No hardcoded credentials. No secrets in git.
- **Network**: Tiresias container on agent-net bridge. Can observe all inter-container traffic. External endpoint monitoring via standard HTTP/TCP probes.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Dual-layer baseline (Git YAML + Supabase) | **CISO Decision**: Git YAML is the policy layer — version controlled, PR-reviewable, diffable, provides change management audit trail. Supabase is the enforcement layer — queryable by scanners, dashboardable, alertable. YAML→Supabase sync is one-directional (git authoritative). **Business justification**: Separation of policy definition (requires human review) from enforcement (automated, real-time). If Supabase is compromised, git baseline is intact. If git is compromised, Supabase has last-known-good state with timestamps. Dual-layer satisfies SOC 2 Type II evidence requirements for configuration management. | — Pending |
| Enterprise on-prem deployment model | Treat GCP as corporate data center, Tiresias as network appliance in dedicated container. Creates reference architecture for enterprise customers. Proves deployment model before selling it. | — Pending |
| Telegram for personal alerts | Personal monitoring — Telegram is already wired to Alfred bot. Enterprise SIEM notification channels are already built into Tiresias proper and don't need reimplementation here. | — Pending |
| Tiresias read-only posture | Monitoring platform must not have write access to monitored infrastructure. Separation of observation from action. Drift remediation runs through a separate remediation service with its own authorization. Defense in depth — if Tiresias is compromised, attacker gains visibility but not control. | — Pending |
| Kali sidecar for active validation | Use existing Kali container for periodic active scanning (port scans, vulnerability checks) rather than building custom scanners. Tools are already installed and maintained. | — Pending |

## CISO Framework

### Threat Model (STRIDE)

| Threat | Attack Vector | Monitored By | Detection Method |
|--------|--------------|--------------|-----------------|
| **Spoofing** | OAuth bypass, API key theft | Security monitoring | Auth failure correlation, impossible travel, credential reuse patterns |
| **Tampering** | Config drift, unauthorized changes | Drift detection | Continuous baseline comparison, hash validation |
| **Repudiation** | Unattributed actions | Audit trail | All events logged with timestamps, source IP, actor identity |
| **Information Disclosure** | PII in LLM traffic, log exposure | Tiresias PII detection | Request/response stream analysis, redaction alerts |
| **Denial of Service** | Resource exhaustion, rate abuse | Health monitoring | Circuit breaker state, request rate anomalies, resource utilization |
| **Elevation of Privilege** | Prompt injection, container escape | Security monitoring + Tiresias | Input classification, container boundary monitoring |

### Compliance Alignment

- **SOC 2 Type II**: Configuration management (drift detection), access monitoring (security telemetry), incident response (alert→remediation chain)
- **NIST CSF**: Identify (baseline), Protect (least privilege), Detect (monitoring), Respond (alerting), Recover (remediation)
- **ISO 27001**: A.12.4 Logging and monitoring, A.12.6 Technical vulnerability management, A.14.1 Security requirements

### Automation Requirements

| Automation | Trigger | Action | Human Required |
|-----------|---------|--------|----------------|
| Drift scan | Continuous (5-min intervals) | Compare declared vs actual state | No — auto-detect |
| Safe drift remediation | Known-safe drift detected | Auto-fix and log | No — auto-remediate |
| Unsafe drift alert | Unknown or dangerous drift | Telegram alert + Supabase incident record | Yes — human reviews |
| Auth failure correlation | 3+ failures in 5 min from same source | Telegram alert + IP logging | Yes — human decides block |
| Prompt injection detection | Classified as injection by Tiresias | Block + log + alert | No — auto-block, human reviews |
| Port scan detection | >10 ports probed in 60s | Log + alert | Yes — human assesses |
| Certificate expiry warning | Cert expires within 14 days | Daily alert until renewed | Yes — human renews |
| Service health degradation | Health score drops below threshold | Circuit breaker + alert | No — auto-circuit-break |
| PII detection in LLM traffic | PII classified in request/response | Redact + log + alert | Yes — human reviews policy |
| Baseline sync | Git push to baseline repo | YAML→Supabase sync | No — auto-sync |

---
*Last updated: 2026-03-19 after initialization*
