# Technology Stack

**Project:** Tiresias Production Monitoring & Drift Detection
**Researched:** 2026-03-19

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Python | 3.12+ | Runtime | Matches existing Alfred fleet. All services are Python. No reason to introduce another language. | HIGH |
| Pydantic | 2.12+ | Data models, validation | Type-safe models for baselines, alerts, scan results. Already standard in Python ecosystem. | HIGH |
| pydantic-settings | 2.13.1 | Configuration management | Native YAML config file support + env var overlay + SecretStr for secrets. Eliminates custom config parsing. | HIGH |
| APScheduler | 3.11.x | Job scheduling | Production-stable cron-style scheduling for drift scans (5-min intervals), health checks, certificate monitors. v4 is alpha -- do NOT use. Stick with 3.11.x which is battle-tested. | HIGH |
| httpx | 0.28+ | Async HTTP client | Async health probes against all public endpoints. Connection pooling, HTTP/2 support, timeout control. Replaces requests for async workloads. | HIGH |
| structlog | 25.5.0 | Structured logging | JSON-structured logs that feed directly into Grafana Loki. Zero-config for console + machine-readable output. Already proven at scale since 2013. | HIGH |

### Drift Detection Engine

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PyYAML | 6.0.2 | YAML baseline parsing | Standard YAML parser. `safe_load` only -- never `load`. Reads git-stored baseline files. | HIGH |
| jsonschema | 4.23+ | Baseline schema validation | Validates YAML baselines against JSON Schema before they enter the system. Catches malformed baselines at git-push time. | HIGH |
| DeepDiff | 8.6.1 | State comparison | Compares declared baseline (dict) vs actual state (dict) and produces structured diffs. Handles nested objects, type changes, list reordering. Core of the drift detection algorithm. | HIGH |
| docker (SDK) | 7.1.0 | Container state inspection | Read container configs, stats, network settings, health status via Docker Engine API. This IS the "actual state" source for container drift. | HIGH |

### Database & Storage

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| supabase-py | 2.x | Supabase client | Existing Supabase project (cgtuoiggcngldtzfqosm). Operational layer for baselines, incidents, audit trail. Already used across Alfred fleet. | HIGH |
| Git (YAML files) | -- | Policy layer | Baseline YAML files version-controlled in git. PR-reviewable, diffable, provides change management audit trail. One-directional sync to Supabase. | HIGH |

### Security Monitoring

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom Python rules engine | -- | Threat detection | Write detection rules as Python functions, not a DSL. Pattern: `def detect_auth_brute_force(events) -> Alert`. Simple, testable, no new language to learn. | MEDIUM |
| fail2ban (host-level) | 1.1+ | IP banning on auth failures | Already written in Python, mature, Docker-compatible via linuxserver/fail2ban image. Monitors log files for auth failure patterns and bans IPs via iptables. Do NOT reimplement this. | HIGH |
| Caddy access logs | -- | HTTP telemetry source | Caddy already reverse-proxies all public endpoints. Its access logs are the primary telemetry source for auth failures, rate anomalies, and suspicious request patterns. Parse, don't replace. | HIGH |

### Container & Network Monitoring

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| docker (SDK) | 7.1.0 | Container stats streaming | `container.stats(stream=False)` for point-in-time CPU/memory/network snapshots. Lightweight -- no sidecar agent needed. | HIGH |
| subprocess + Kali tools | -- | Active scanning | Use existing Kali sidecar (nmap, nuclei, subfinder) via `docker exec`. Do NOT install scanning tools in Tiresias container. Separation of concerns. | HIGH |

### Alerting & Notifications

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| python-telegram-bot | 21.x | Telegram alerts | Existing alert channel. Alfred bot already wired. Tiresias sends structured alerts through same pipeline. | HIGH |
| Grafana Cloud Loki | -- | Log aggregation | Already receiving logs via alfred_logger.py. Add Tiresias events as structured log entries. Detection rules query Loki. | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pytest | 8.x | Test framework | Standard. No reason to use anything else. | HIGH |
| pytest-asyncio | 0.24+ | Async test support | Required for testing async health probes and scan loops. | HIGH |
| pytest-docker | -- | Integration tests | Spin up test containers to validate drift detection against known-drifted states. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| SIEM | Custom Python rules engine | Wazuh | Wazuh needs 6GB+ RAM minimum. Single GCP VM with 4GB container limit makes this impossible. Wazuh is a full SIEM -- we need SIEM-lite detection rules, not a platform. |
| SIEM | Custom Python rules engine | Elastic SIEM | Even heavier than Wazuh. Elasticsearch alone wants 4GB+ heap. Completely out of scope for resource constraints. |
| Container monitoring | Docker SDK (docker-py) | Prometheus + cAdvisor | cAdvisor alone uses 100-200MB RAM. Prometheus needs persistent storage. Overkill for 5 containers. Docker SDK stats API gives us everything we need at zero overhead. |
| Container security | Custom rules + Kali | Falco | Falco requires privileged container + eBPF/kernel module. Adds complexity, memory overhead, and kernel-level access that violates the read-only monitoring posture. Good for Kubernetes scale, overkill for 5 Docker containers. |
| Drift comparison | DeepDiff | Custom diff logic | DeepDiff handles edge cases (type changes, list reordering, nested dicts, ignore paths) that would take weeks to reimplement. 8.6.1 is production-stable with security patches. |
| Scheduling | APScheduler 3.11.x | APScheduler 4.x | v4 is alpha (4.0.0a6). Explicitly states "NOT for production." Major breaking changes with no migration path guarantee. 3.11.x is production-ready. |
| Scheduling | APScheduler 3.11.x | Celery | Celery needs Redis/RabbitMQ broker. Adds 2 more containers and 200-500MB RAM. APScheduler runs in-process with no external dependencies. |
| Scheduling | APScheduler 3.11.x | system cron | Cron can't do 5-minute intervals with stagger, can't do dynamic scheduling, can't report job failures programmatically. APScheduler is an in-process scheduler with cron triggers. |
| HTTP client | httpx | aiohttp | httpx has cleaner API, built-in sync+async, HTTP/2 support. aiohttp is more complex for simple health probes. |
| HTTP client | httpx | requests | requests is sync-only. Health probes against 6+ endpoints need to be concurrent, not serial. |
| Config management | pydantic-settings | python-dotenv + manual YAML | pydantic-settings gives typed validation, YAML support, env overlay, and SecretStr in one package. Manual parsing is error-prone. |
| Logging | structlog | stdlib logging | structlog produces JSON logs natively for Loki ingestion. stdlib logging needs formatters, handlers, and configuration to achieve the same. |
| Network analysis | Caddy log parsing | Scapy packet capture | Scapy requires privileged mode + NET_RAW capability. Violates read-only monitoring posture. Caddy logs already contain all HTTP-level telemetry we need (IPs, status codes, paths, timing). Scapy is for packet-level analysis -- unnecessary when we have an L7 reverse proxy. |
| YAML validation | jsonschema | pykwalify / Yamale | jsonschema is the standard, used everywhere, maps directly to JSON Schema spec. pykwalify has its own schema format. Yamale is simpler but less expressive. |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Wazuh / Elastic SIEM / Splunk | Memory requirements (6-16GB+) exceed VM constraints. We need detection rules, not a full SIEM platform. |
| Prometheus + Grafana (self-hosted) | Already have Grafana Cloud Loki. Self-hosted Prometheus + Grafana adds 500MB+ RAM and operational burden. |
| Kubernetes / k3s | Single VM with 5 containers. Kubernetes adds massive overhead for zero benefit at this scale. |
| Terraform / Pulumi drift detection | These detect IaC drift for cloud resources. Our drift is application-config and container-state drift. Different problem domain. |
| OpenTelemetry Collector | Good for microservices at scale. Overkill for 5 containers. Docker SDK + structlog + Loki covers our observability needs. |
| Ansible check mode | Ansible detects drift against playbooks. We don't use Ansible. Our baselines are YAML declarations, not playbooks. |
| Scapy / tcpdump | Requires privileged containers. Caddy access logs give us HTTP telemetry without packet capture. |

## Installation

```bash
# Core
pip install pydantic pydantic-settings httpx structlog apscheduler

# Drift detection
pip install pyyaml jsonschema deepdiff docker

# Database
pip install supabase

# Alerting
pip install python-telegram-bot

# Testing
pip install pytest pytest-asyncio

# All in one line
pip install pydantic pydantic-settings httpx structlog apscheduler pyyaml jsonschema deepdiff docker supabase python-telegram-bot pytest pytest-asyncio
```

## Memory Budget

The entire Tiresias container should fit within **256-512MB RAM**:

| Component | Estimated Memory | Notes |
|-----------|-----------------|-------|
| Python runtime | 30-50MB | Base interpreter |
| Application code + libraries | 50-80MB | All pip packages loaded |
| APScheduler (in-process) | 5-10MB | Job store in memory |
| Docker SDK connections | 10-20MB | Socket connections to Docker API |
| httpx connection pool | 10-20MB | Async HTTP client pool |
| Scan results buffer | 20-50MB | Temporary state during drift scans |
| **Total estimated** | **~150-250MB** | Well within 512MB limit |

This leaves 3.5-3.75GB for the existing containers (agent-zero at 4GB limit, qdrant, kali, caddy).

## Sources

- [DeepDiff 8.6.1 documentation](https://zepworks.com/deepdiff/current/) - HIGH confidence
- [Docker SDK for Python 7.1.0](https://docker-py.readthedocs.io/) - HIGH confidence
- [pydantic-settings 2.13.1 PyPI](https://pypi.org/project/pydantic-settings/) - HIGH confidence
- [APScheduler PyPI](https://pypi.org/project/APScheduler/) - HIGH confidence, v4 alpha status verified
- [structlog 25.5.0 documentation](https://www.structlog.org/) - HIGH confidence
- [httpx documentation](https://www.python-httpx.org/) - HIGH confidence
- [Wazuh Docker deployment docs](https://documentation.wazuh.com/current/deployment-options/docker/wazuh-container.html) - HIGH confidence on 6GB requirement
- [fail2ban GitHub](https://github.com/fail2ban/fail2ban) - HIGH confidence
- [jsonschema for YAML validation](https://devops-db.com/python-yaml-validation-with-json-schema/) - HIGH confidence
