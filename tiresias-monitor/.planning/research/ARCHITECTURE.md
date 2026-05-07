# Architecture Research

**Domain:** Infrastructure monitoring, drift detection, and security observability (Docker-based on-prem appliance)
**Researched:** 2026-03-19
**Confidence:** HIGH

## System Overview

```
                          EXTERNAL
  ┌──────────────────────────────────────────────────────┐
  │  Public Endpoints                                    │
  │  (alfred.saluca.com, webhook:8767, voice:8765, MCP)  │
  └────────────────────────┬─────────────────────────────┘
                           │ HTTPS/TCP
  ┌────────────────────────┴─────────────────────────────┐
  │                    GCP VM (34.41.26.234)              │
  │                                                      │
  │  ┌─── agent-net (Docker bridge) ──────────────────┐  │
  │  │                                                │  │
  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
  │  │  │ agent-   │ │  qdrant  │ │   kali   │       │  │
  │  │  │  zero    │ │          │ │ sidecar  │       │  │
  │  │  └──────────┘ └──────────┘ └──────────┘       │  │
  │  │  ┌──────────┐                                  │  │
  │  │  │  caddy   │  (reverse proxy / TLS)           │  │
  │  │  └──────────┘                                  │  │
  │  │                                                │  │
  │  │  ┌────────────────────────────────────────┐    │  │
  │  │  │         TIRESIAS APPLIANCE             │    │  │
  │  │  │                                        │    │  │
  │  │  │  ┌────────────┐  ┌─────────────────┐   │    │  │
  │  │  │  │ Collectors │  │ Drift Scanner   │   │    │  │
  │  │  │  │ (security  │  │ (baseline       │   │    │  │
  │  │  │  │  telemetry)│  │  reconciler)    │   │    │  │
  │  │  │  └─────┬──────┘  └───────┬─────────┘   │    │  │
  │  │  │        │                 │              │    │  │
  │  │  │  ┌─────┴─────────────────┴─────────┐   │    │  │
  │  │  │  │     Normalization / Event Bus    │   │    │  │
  │  │  │  └─────────────┬───────────────────┘   │    │  │
  │  │  │                │                        │    │  │
  │  │  │  ┌─────────────┴───────────────────┐   │    │  │
  │  │  │  │     Correlation Engine           │   │    │  │
  │  │  │  │  (rules + threat detection)      │   │    │  │
  │  │  │  └─────────────┬───────────────────┘   │    │  │
  │  │  │                │                        │    │  │
  │  │  │  ┌─────────────┴───────────────────┐   │    │  │
  │  │  │  │     Alert Dispatcher            │   │    │  │
  │  │  │  │  (Telegram + Supabase audit)    │   │    │  │
  │  │  │  └─────────────────────────────────┘   │    │  │
  │  │  └────────────────────────────────────────┘    │  │
  │  │                                                │  │
  │  └────────────────────────────────────────────────┘  │
  │                                                      │
  │  ┌─ Host-level Services (systemd) ────────────────┐  │
  │  │  webhook:8767  monitor  voice:8765  alloy       │  │
  │  └─────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────┴────────┐    ┌──────────┴──────────┐
     │   Supabase      │    │  Grafana Cloud Loki │
     │ (structured     │    │  (log aggregation)  │
     │  audit trail)   │    │                     │
     └─────────────────┘    └─────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Baseline Store** | Declares expected infrastructure state (the "should be") | Git YAML files (policy authority) synced one-way to Supabase (enforcement/query layer) |
| **Drift Scanner** | Compares declared baseline to actual state, emits drift events | Python process inside Tiresias container, runs on 5-min reconciliation loop |
| **Security Collectors** | Gather telemetry from endpoints, logs, and network activity | Multiple collector modules: HTTP probe, log tail, Docker API, Kali active scans |
| **Normalizer / Event Bus** | Standardizes heterogeneous events into a uniform schema | In-process event pipeline; all events become typed dicts with timestamp, source, severity, payload |
| **Correlation Engine** | Matches patterns across normalized events to detect threats | Rule-based engine with detection rules (auth failure correlation, port scan detection, anomaly thresholds) |
| **Alert Dispatcher** | Routes confirmed incidents to notification channels and audit store | Telegram bot API for real-time alerts, Supabase INSERT for audit trail, Loki push for log archive |
| **Remediation Service** | Executes safe-drift auto-fixes with separate authorization | Separate process (NOT inside Tiresias) with write access to infrastructure; Tiresias can only request remediation |
| **Kali Scanner** | Active vulnerability scanning and validation | Existing container on agent-net; Tiresias schedules scans via Docker exec or TCP command |

## Recommended Project Structure

```
tiresias-monitor/
├── baselines/                  # Git-authoritative YAML baselines
│   ├── services.yaml           # Expected services, ports, health endpoints
│   ├── containers.yaml         # Expected Docker containers, images, resource limits
│   ├── network.yaml            # Expected network config, firewall rules, open ports
│   ├── credentials.yaml        # Expected credential rotation state (no secrets here)
│   └── endpoints.yaml          # Expected public endpoints and TLS config
├── src/
│   ├── collectors/             # Data ingestion modules
│   │   ├── docker_collector.py # Docker API: container state, resource usage, network
│   │   ├── http_probe.py       # HTTP/TCP probes against public endpoints
│   │   ├── log_collector.py    # Tail systemd journals + container logs
│   │   ├── kali_scanner.py     # Orchestrate Kali sidecar for active scans
│   │   └── host_collector.py   # Host-level: disk, memory, processes, certs
│   ├── drift/                  # Drift detection engine
│   │   ├── scanner.py          # Reconciliation loop: load baseline, compare actual, emit drift events
│   │   ├── baseline_loader.py  # Parse YAML baselines + Supabase enforcement layer
│   │   ├── comparators.py      # Type-specific comparison logic (container, service, network, cert)
│   │   └── remediation.py      # Safe-drift auto-fix definitions + remediation request API
│   ├── detection/              # Security threat detection
│   │   ├── rules.py            # Detection rule definitions (auth failure, port scan, PII, prompt injection)
│   │   ├── correlator.py       # Correlation engine: window-based pattern matching across events
│   │   └── threat_intel.py     # Known-bad patterns, IP reputation (future: external feeds)
│   ├── pipeline/               # Event normalization and routing
│   │   ├── events.py           # Event schema definitions (typed dataclasses)
│   │   ├── normalizer.py       # Raw collector output -> normalized events
│   │   └── bus.py              # In-process event bus (publish/subscribe)
│   ├── alerting/               # Notification and audit
│   │   ├── dispatcher.py       # Route alerts by severity to appropriate channels
│   │   ├── telegram.py         # Telegram bot API integration
│   │   ├── supabase_audit.py   # Write audit trail to Supabase tables
│   │   └── loki_push.py        # Push structured logs to Grafana Cloud Loki
│   ├── api/                    # Tiresias appliance API (health, status, config)
│   │   └── server.py           # Lightweight HTTP API for appliance status
│   └── main.py                 # Entrypoint: scheduler, lifecycle management
├── docker/
│   ├── Dockerfile              # Tiresias appliance container image
│   └── docker-compose.tiresias.yaml  # Compose overlay to add Tiresias to agent-net
├── tests/
│   ├── test_drift.py
│   ├── test_detection.py
│   └── test_pipeline.py
├── .planning/                  # GSD project planning
└── README.md
```

### Structure Rationale

- **baselines/:** Separated from source code because these are policy documents, not application logic. They change on a different cadence (when infrastructure changes) and are the primary artifact for compliance audits.
- **src/collectors/:** Each collector is an independent module that knows how to gather one type of telemetry. New collectors can be added without touching existing ones. Follows the SIEM collector pattern.
- **src/drift/ vs src/detection/:** Drift detection (configuration reconciliation) and security detection (threat correlation) are fundamentally different concerns. Drift asks "does reality match the baseline?" Security asks "is this behavior malicious?" They share the event bus but have different rule systems.
- **src/pipeline/:** The normalization layer is the integration seam. Every collector emits raw data, the normalizer converts it to a common event schema, and the bus distributes it. This is the standard SIEM data flow and it decouples collectors from consumers.
- **docker/:** Compose overlay pattern -- Tiresias adds itself to the existing docker-compose stack rather than replacing it. This models the enterprise deployment: customer has existing infrastructure, drops in the Tiresias appliance.

## Architectural Patterns

### Pattern 1: Reconciliation Loop (Drift Detection)

**What:** A continuous loop that compares declared state to actual state and emits drift events. Directly borrowed from the Kubernetes controller pattern where controllers constantly reconcile desired vs actual state.

**When to use:** Any time you have a declared "should be" and need to detect deviation. This is the core of drift detection.

**Trade-offs:** Simple, predictable, debuggable. 5-minute intervals mean up to 5 minutes of undetected drift. Acceptable for this use case -- sub-minute drift detection requires event-driven architecture (watching Docker events, file watches) which adds complexity. Start with polling, add event triggers for critical paths later.

**Example:**
```python
async def reconciliation_loop(baseline: Baseline, interval: int = 300):
    while True:
        actual = await collect_actual_state()
        drifts = compare(baseline.declared, actual)
        for drift in drifts:
            if drift.is_safe and drift.has_auto_fix:
                await request_remediation(drift)
                await emit_event(DriftRemediated(drift))
            else:
                await emit_event(DriftDetected(drift))
        await asyncio.sleep(interval)
```

### Pattern 2: Collector-Normalizer-Correlator Pipeline (SIEM Pattern)

**What:** The standard four-stage SIEM data flow: Collect raw data from heterogeneous sources, Normalize into a common schema, Correlate across sources to detect patterns, Alert on confirmed incidents. This is the architecture used by every major SIEM (Splunk, Elastic SIEM, Wazuh, etc.).

**When to use:** Any security monitoring system that ingests data from multiple sources and needs to detect cross-source patterns (e.g., "auth failure on endpoint A followed by port scan from same IP").

**Trade-offs:** Well-understood, battle-tested pattern. The normalizer is the hardest part to get right because every source has different log formats. For this project, we control all sources, so normalization is straightforward.

**Example:**
```python
# Collector emits raw data
raw = DockerCollectorEvent(container="agent-zero", status="running", cpu=45.2)

# Normalizer converts to common schema
event = NormalizedEvent(
    timestamp=datetime.utcnow(),
    source="docker_collector",
    category="infrastructure",
    severity="info",
    payload={"container": "agent-zero", "metric": "cpu", "value": 45.2}
)

# Correlator checks rules
for rule in active_rules:
    if rule.matches(event, window=rule.time_window):
        await dispatch_alert(rule.create_alert(event))
```

### Pattern 3: Appliance-on-Bridge (Network Observation)

**What:** The Tiresias container joins the same Docker bridge network (`agent-net`) as the monitored services. This gives it DNS resolution to all containers by name and the ability to make HTTP requests to any container port. It does NOT automatically see inter-container traffic passively -- Docker bridge networks forward frames directly between containers via veth pairs through the bridge, so a third container on the bridge only sees traffic addressed to it.

**When to use:** When the monitoring appliance needs to actively probe services on the same network but does not need passive packet capture.

**Trade-offs:** Active probing (HTTP health checks, TCP connects, API queries) is sufficient for this project's needs. Passive traffic capture would require either `network_mode: host` (breaks container isolation), `NET_ADMIN` + `NET_RAW` capabilities with ARP spoofing (dangerous), or a service mesh with sidecar proxies (overkill). Active probing is the right choice for an enterprise monitoring appliance -- it is non-invasive, least-privilege, and models what a real customer deployment would do.

**Critical insight:** Tiresias monitors by querying, not by sniffing. It calls Docker API to check container state, makes HTTP requests to health endpoints, reads logs via Docker log API or mounted volumes, and queries Supabase for structured data. This is how enterprise monitoring actually works.

## Data Flow

### Primary Data Flow: Collection to Alerting

```
                    ┌──────────────────────────────────────────────┐
                    │              DATA SOURCES                     │
                    │                                              │
                    │  Docker API   HTTP endpoints   systemd logs  │
                    │  Supabase     Kali scans       Host metrics  │
                    └───────┬──────────┬──────────────┬────────────┘
                            │          │              │
                    ┌───────┴──────────┴──────────────┴────────────┐
                    │              COLLECTORS                       │
                    │  docker_collector  http_probe  log_collector  │
                    │  host_collector    kali_scanner               │
                    └───────────────────┬──────────────────────────┘
                                        │ raw events
                    ┌───────────────────┴──────────────────────────┐
                    │              NORMALIZER                       │
                    │  Raw events -> NormalizedEvent schema         │
                    │  Adds: timestamp, source, category, severity │
                    └───────────────────┬──────────────────────────┘
                                        │ normalized events
                              ┌─────────┴─────────┐
                              │    EVENT BUS       │
                              │  (pub/sub fanout)  │
                              └──┬─────────────┬───┘
                                 │             │
                    ┌────────────┴──┐   ┌──────┴───────────────────┐
                    │ DRIFT ENGINE  │   │ CORRELATION ENGINE       │
                    │               │   │                          │
                    │ Compare to    │   │ Window-based pattern     │
                    │ baseline,     │   │ matching: auth failures, │
                    │ emit drift    │   │ port scans, PII, prompt  │
                    │ events        │   │ injection, anomalies     │
                    └───────┬───────┘   └──────────┬───────────────┘
                            │ drift alerts         │ security alerts
                    ┌───────┴──────────────────────┴───────────────┐
                    │              ALERT DISPATCHER                 │
                    │                                              │
                    │  Severity routing:                            │
                    │  CRITICAL -> Telegram immediate + Supabase   │
                    │  HIGH     -> Telegram + Supabase             │
                    │  MEDIUM   -> Supabase + Loki                 │
                    │  LOW      -> Loki only                       │
                    └──────────────────────────────────────────────┘
```

### Baseline Sync Flow

```
Developer pushes YAML change
    │
    ▼
Git repo (baselines/*.yaml)  ── authoritative source of truth
    │
    │  one-directional sync (CI or cron)
    ▼
Supabase baseline tables  ── enforcement/query layer
    │
    │  drift scanner reads on each loop iteration
    ▼
Drift comparison: Supabase baseline vs actual state
```

### Key Data Flows

1. **Drift detection:** Baseline YAML -> Supabase sync -> Drift scanner reads baseline -> Collectors gather actual state -> Comparator emits drift events -> Safe drifts auto-remediated, unsafe drifts alerted.

2. **Security telemetry:** HTTP probes + log tailing + Docker API -> Normalizer -> Correlation engine applies detection rules over sliding time windows -> Matched rules generate security alerts -> Dispatcher routes to Telegram + Supabase audit trail.

3. **Active scanning:** Scheduled Kali scans (nmap, nuclei) -> Results parsed by kali_scanner collector -> Normalized -> Correlated with baseline (is this port expected?) -> Unexpected open ports flagged as drift + potential security event.

4. **Audit trail:** Every event (drift, security, remediation, scan result) is written to Supabase with full context. This is the compliance evidence layer. Immutable append-only. Queryable for reporting.

## Docker Networking Specifics

### How Tiresias Sits on agent-net

Tiresias joins `agent-net` as an additional container in the compose stack. Use a compose overlay file:

```yaml
# docker-compose.tiresias.yaml
services:
  tiresias:
    image: tiresias-monitor:latest
    container_name: tiresias-monitor
    networks:
      - agent-net
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Docker API (read-only)
      - ./baselines:/app/baselines:ro                  # YAML baselines (read-only)
    environment:
      - SUPABASE_URL=...
      - SUPABASE_SERVICE_KEY=...  # via _alfred_vault
      - TELEGRAM_BOT_TOKEN=...
      - TELEGRAM_CHAT_ID=...
    mem_limit: 512m
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true

networks:
  agent-net:
    external: true
```

### What Tiresias Can See on agent-net

| Access Method | What It Sees | How |
|---------------|-------------|-----|
| Docker API (socket) | All container state, logs, stats, network config | `/var/run/docker.sock` mounted read-only |
| DNS resolution | All containers by name | Docker DNS on bridge network |
| HTTP requests | Any container port (agent-zero:80, qdrant:6333) | Direct TCP over bridge |
| Host metrics | Disk, memory, CPU, processes | Docker API `/info` + `/system/df` |
| Kali scans | Port scans, vulnerability checks on any container | HTTP/TCP to kali container to trigger scans |

### What Tiresias Cannot See (and Should Not)

| Cannot See | Why | Alternative |
|------------|-----|-------------|
| Inter-container traffic passively | Bridge forwards frames directly; no promiscuous mode without `NET_ADMIN` | Active probing (HTTP checks), log analysis |
| Host filesystem | No host volume mounts beyond Docker socket and baselines | Query via Docker API |
| Secrets in other containers | No access to other container environments | Monitor for secret exposure in logs/responses |
| Write to other containers | Read-only posture; no Docker exec on monitored containers | Remediation service is separate with its own authz |

### Network Isolation Principle

The Docker socket mount is the most privileged access Tiresias has. It provides read access to all Docker state. Mount it read-only (`:ro`). In a production enterprise deployment, you would use a Docker API proxy (like Tecnativa/docker-socket-proxy) that restricts which API endpoints are accessible. For the reference architecture, document this as a hardening step.

## Separation of Concerns

This is a critical architectural boundary:

```
┌─────────────────────────────────────────────────────────┐
│                    OBSERVATION LAYER                      │
│  (Tiresias appliance — read-only, no write access)       │
│                                                          │
│  - Collectors gather state                               │
│  - Drift scanner compares to baseline                    │
│  - Correlation engine detects threats                    │
│  - Alert dispatcher notifies                             │
│  - Audit writer records events                           │
│                                                          │
│  CAN: read Docker API, query endpoints, read logs        │
│  CANNOT: modify containers, change config, exec commands │
└─────────────────────────┬───────────────────────────────┘
                          │ remediation request (event)
┌─────────────────────────┴───────────────────────────────┐
│                    REMEDIATION LAYER                      │
│  (Separate service — scoped write access)                │
│                                                          │
│  - Receives remediation requests from observation layer  │
│  - Validates request against allow-list of safe fixes    │
│  - Executes fix (restart container, rotate cert, etc.)   │
│  - Logs action to audit trail                            │
│                                                          │
│  CAN: restart containers, update configs (allow-listed)  │
│  CANNOT: delete data, modify Tiresias, access secrets    │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                    ALERTING LAYER                         │
│  (Integrated into observation, but logically separate)   │
│                                                          │
│  - Telegram: real-time human notification                │
│  - Supabase: structured audit trail (compliance)         │
│  - Loki: log aggregation (operational debugging)         │
└─────────────────────────────────────────────────────────┘
```

**Why this separation matters:** If the observation layer is compromised, the attacker gains visibility but not control. They can see what infrastructure exists but cannot modify it. The remediation layer has separate credentials, a narrow allow-list, and logs every action. This is defense-in-depth and satisfies SOC 2 separation-of-duties requirements.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single VM (current) | All-in-one Tiresias container. In-process event bus. Direct Supabase writes. This is the starting point and is sufficient for monitoring a single-host Docker deployment. |
| 3-5 VMs | One Tiresias appliance per host, central Supabase for correlation. Each appliance collects locally, pushes events to shared Supabase tables. Correlation queries run against aggregated data. |
| Enterprise (10+ hosts) | Tiresias appliances report to a central Tiresias coordinator. Event bus becomes a message queue (NATS or Redis Streams). Correlation engine moves to the coordinator. This is the future product architecture but out of scope for this deployment. |

### Scaling Priorities

1. **First bottleneck: Supabase write volume.** Each 5-minute scan cycle generates events. At single-VM scale this is trivial (dozens of events/cycle). Batch writes rather than individual INSERTs from day one to avoid hitting this later.
2. **Second bottleneck: Correlation window memory.** The correlation engine holds events in sliding time windows. At single-VM scale, memory usage is negligible. At multi-host scale, windows must be bounded and old events evicted.

## Anti-Patterns

### Anti-Pattern 1: Monitoring System Modifies Monitored Infrastructure

**What people do:** Give the monitoring tool write access to restart services, modify configs, or "heal" infrastructure directly.
**Why it is wrong:** If the monitoring tool is compromised, the attacker has full control. If the monitoring tool has a bug, it can cause outages by making unintended changes. Violates separation of duties for compliance.
**Do this instead:** Observation layer is strictly read-only. Remediation is a separate service with its own credentials, allow-list, and audit trail. Tiresias can REQUEST remediation but never EXECUTE it directly.

### Anti-Pattern 2: Baseline in Code, Not in Data

**What people do:** Hardcode expected infrastructure state in Python dictionaries or config files inside the monitoring application.
**Why it is wrong:** Baselines change when infrastructure changes. If the baseline lives in application code, changing it requires a code deploy. Non-technical stakeholders cannot review baselines. No audit trail of baseline changes.
**Do this instead:** Baselines in YAML files in git (version controlled, PR-reviewable, diffable) synced to Supabase (queryable, dashboardable). Application code is generic -- it reads whatever baseline is configured.

### Anti-Pattern 3: Alert-Everything / Alert-Nothing

**What people do:** Either alert on every event (alert fatigue, humans ignore) or set thresholds so high that real incidents are missed.
**Why it is wrong:** Alert fatigue is the number one operational failure mode in monitoring. Security teams that receive 1000+ daily alerts eventually stop reading them.
**Do this instead:** Severity-based routing. CRITICAL/HIGH go to Telegram (human attention). MEDIUM goes to Supabase (queryable, reviewed in daily/weekly cadence). LOW goes to Loki (archived, available for forensics). Tune thresholds based on real data after initial deployment.

### Anti-Pattern 4: Passive Network Sniffing in Docker

**What people do:** Try to capture inter-container traffic by putting the monitoring container in promiscuous mode on the bridge network.
**Why it is wrong:** Requires `NET_ADMIN` and `NET_RAW` capabilities, which are a significant privilege escalation. Docker bridge forwards frames directly between veth pairs -- promiscuous mode on a third container's interface does not reliably capture traffic. Breaks the least-privilege security model.
**Do this instead:** Active probing. Query Docker API for container state. Make HTTP requests to health endpoints. Read logs via Docker log API. This is what enterprise monitoring appliances actually do.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase | REST API via `supabase-py` or raw HTTP | Audit trail writes, baseline sync reads, service_health queries. Use service role key from `_alfred_vault`. Batch writes to reduce API calls. |
| Grafana Cloud Loki | HTTP push API via existing `alfred_logger.py` pattern | Structured log events. Reuse the Loki push pattern already in production. Add Tiresias-specific labels. |
| Telegram | Bot API via existing `alfred_bot` token | Alert dispatch. Reuse existing Telegram integration. Add Tiresias-specific message formatting. |
| Docker API | Unix socket `/var/run/docker.sock` | Container state, logs, stats, network inspection. Mount read-only. Consider docker-socket-proxy for hardening. |
| Kali sidecar | Docker exec or TCP command to kali container | Trigger nmap/nuclei scans. Parse results. Schedule on longer intervals (hourly/daily) since active scans are heavier. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Collectors -> Normalizer | Function call (in-process) | Collectors return raw dicts, normalizer converts to NormalizedEvent dataclasses. No network hop needed at single-container scale. |
| Normalizer -> Event Bus | Publish to in-process bus | Simple pub/sub. Use `asyncio.Queue` or a lightweight event emitter. Replace with NATS/Redis only at multi-host scale. |
| Event Bus -> Drift Engine | Subscribe | Drift engine also independently queries actual state on its loop. Bus events supplement with real-time signals. |
| Event Bus -> Correlation Engine | Subscribe | Correlation engine maintains sliding windows of events and applies detection rules. |
| Drift/Correlation -> Alert Dispatcher | Function call with alert object | Alert dispatcher handles routing logic (severity -> channel mapping). |
| Tiresias -> Remediation Service | HTTP request or Supabase event | Observation layer requests remediation, does not execute it. Remediation service validates and acts. |

## Build Order Implications

Based on component dependencies, the suggested build order is:

1. **Event schema + Event bus** -- Everything downstream depends on the event format. Define `NormalizedEvent` dataclass and the pub/sub bus first. This is the spine of the system.

2. **Baseline format + Baseline loader** -- Define the YAML schema for baselines and the loader that reads them. Without baselines, drift detection has nothing to compare against.

3. **Docker collector + Host collector** -- The two most important data sources. Docker collector provides container state; host collector provides system metrics. These prove the collection pipeline works end-to-end.

4. **Drift scanner** -- Once you have baselines and collectors, wire up the reconciliation loop. This is the highest-value deliverable -- it answers "is my infrastructure in the expected state?"

5. **Alert dispatcher (Telegram + Supabase)** -- Wire drift events to notifications. At this point you have a working drift detection system that alerts on deviation.

6. **HTTP probe collector** -- Add endpoint monitoring. Probes public endpoints for availability, TLS cert expiry, response codes.

7. **Detection rules + Correlation engine** -- Security detection rules (auth failures, port scans, anomalies) applied over the normalized event stream. This is the security observability layer on top of the infrastructure monitoring foundation.

8. **Log collector** -- Tail container and systemd logs, normalize, feed into correlation engine.

9. **Kali scanner integration** -- Scheduled active scans. Lower priority because it builds on everything above and provides validation rather than primary detection.

10. **Remediation service** -- Last because it requires the most careful security design (allow-listing, separate credentials, audit trail). The observation system must be proven reliable before auto-remediation is trusted.

**Rationale:** This order builds value incrementally. After step 5, you have a working drift detection system. After step 7, you have security observability. Steps 8-10 are enhancements. Each step can be deployed and tested independently.

## Sources

- [SIEM Architecture: 10 Key Components and Best Practices - Coralogix](https://coralogix.com/guides/siem/siem-architecture-10-key-components-and-best-practices/)
- [What is SIEM Architecture? Components & Best Practices - SentinelOne](https://www.sentinelone.com/cybersecurity-101/data-and-ai/siem-architecture/)
- [Sidecar Pattern - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar)
- [How Container Bridge Networking Actually Works - Cloud Odyssey](https://cloudodyssey.substack.com/p/how-container-bridge-networking-actually)
- [GitOps: Curing the Configuration Drift Epidemic - BridgePhase](https://bridgephase.com/insights/drift-detection/)
- [Infrastructure Drift Detection and Reconciliation - Spacelift](https://spacelift.io/drift-detection)
- [Kubernetes and Reconciliation Patterns - Hossein Kassaei](https://hkassaei.com/posts/kubernetes-and-reconciliation-patterns/)
- [Docker Container Networking Modes - OneUpTime](https://oneuptime.com/blog/post/2026-01-25-docker-container-networking-modes/view)

---
*Architecture research for: Infrastructure monitoring, drift detection, and security observability*
*Researched: 2026-03-19*
