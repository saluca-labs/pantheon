# SoulWatch - Product Datasheet

**AI Runtime Security Monitoring**

---

## Overview

SoulWatch provides real-time behavioral monitoring and threat detection for AI agent fleets. It learns normal agent behavior, detects anomalies, and triggers automated responses - all without ever accessing the data your agents handle.

Built for security operations teams, SoulWatch integrates directly into existing SOC workflows with Sigma-compatible detection rules, native SIEM forwarding, and enterprise notification routing.

**Status**: Generally Available
**Version**: 3.6.1
**Deployment**: Docker sidecar alongside SoulAuth
**Docker Hub**: salucalabs/tiresias-soulwatch

---

## Core Capabilities

### Anomaly Detection
- 8 anomaly detection types covering behavioral, temporal, and volumetric patterns
- Behavioral baseline learning per agent
- Fleet-wide anomaly correlation
- Persistent anomaly state tracked in database

### Sigma Rule Engine
- 7 built-in Sigma detection rules
- 3 automated response playbooks
- Custom rule authoring support
- SOC-compatible rule format for seamless integration

### Agent Risk Scoring
- Composite risk score (0-100) per agent
- Multi-factor scoring: behavior, policy compliance, anomaly history
- Configurable risk thresholds
- Real-time score updates

### Quarantine Orchestration
- 7 graduated response actions (alert through full isolation)
- Automated quarantine triggered by policy or risk threshold
- Calls SoulAuth admin API to suspend/revoke compromised agents
- Policy-owner configurable thresholds
- Full quarantine audit trail

### SIEM Integration
- **Splunk** - Native HEC forwarding
- **Elastic** - Direct index integration
- **Microsoft Sentinel** - Azure Log Analytics connector
- **Syslog** - RFC 5424 compliant
- **Webhook** - Custom endpoint forwarding
- Dead letter queue for delivery reliability

### Aletheia Module
- Tool invocation audit and monitoring
- Chain-of-Thought (CoT) chain verification
- Output sanitization policies
- Security policy enforcement for agent tool usage
- 16 dedicated API endpoints, 4 database tables

### Enterprise Notifications
- PagerDuty incident creation
- Slack channel alerts
- Microsoft Teams webhooks
- OpsGenie alert integration

---

## Technical Specifications

| Specification | Detail |
|---|---|
| API | RESTful, 55 operations |
| Architecture | Async event pipeline |
| Live Feed | WebSocket real-time stream |
| Detection | Sigma-compatible rule engine |
| Anomaly Types | 8 (behavioral, temporal, volumetric) |
| Response Actions | 7 graduated levels |
| SIEM Targets | 5 (Splunk, Elastic, Sentinel, Syslog, Webhook) |
| Reliability | Dead letter queue for SIEM delivery |
| Database | PostgreSQL 16 (shared cluster, isolated tables) |
| Aletheia | 16 endpoints, CoT audit, tool monitoring |
| Monitoring | 8 Prometheus metrics, health checks |
| Compliance | SOC2, ISO 27001, NIST 800-53 reports |
| Container | Docker sidecar |
| Orchestration | Kubernetes-ready (GCP Cloud Run verified) |

---

## Architecture

```
Agent Traffic (metadata only)
        |
+-------v-------------------+
|       SoulWatch            |
|  +---------------------+  |
|  | Event Ingestion      |  |
|  | Baseline Engine      |  |
|  | Anomaly Detector     |  |
|  | Sigma Rule Engine    |  |
|  | Risk Scorer          |  |
|  | Quarantine Engine ---|--|--> SoulAuth Admin API
|  +---------------------+  |
|           |                |
|  +--------v---------+     |
|  | SIEM Forwarder    |     |
|  | (Splunk, Elastic, |     |
|  |  Sentinel, Syslog)|     |
|  +-----|------+------+     |
|        |      |            |
|  +-----v--+  |            |
|  | DLQ    |  |            |
|  +--------+  |            |
+----------|---v------------+
           |   |
     Notifications (PagerDuty,
     Slack, Teams, OpsGenie)
```

**Key principle**: SoulWatch reads SoulAuth audit data and agent metadata. It never reads agent payloads or writes to SoulAuth tables.

---

## Compliance Reports

SoulWatch generates compliance-ready reports mapped to:

- **SOC 2** - Trust Services Criteria mapping
- **ISO 27001** - Annex A control mapping
- **NIST 800-53** - Security control family mapping

Reports include detection coverage, incident response metrics, quarantine actions, and policy compliance rates.

---

## Pricing

SoulWatch is not sold separately. It is included as part of the unified Tiresias platform.

| Tier | Platform Price | SoulWatch Access |
|---|---|---|
| **Open** | **Free** | Observability dashboard, PRH prompt risk scoring (read-only), 18-type anomaly detection (baselines), 7-day retention |
| **Starter** | **$49/mo** | Everything in Open + session replay, provider health monitoring, basic analytics, 30-day retention |
| **Pro** | **$199/mo** | Everything in Starter + custom Sigma rules, response playbooks with auto-quarantine, Aletheia module, behavioral anomaly detection with alerting, 90-day retention, WebSocket live feed |
| **Enterprise** | **$2,499/mo** | Everything in Pro + unlimited SIEM destinations, SOC2/ISO/NIST reports, PagerDuty/Slack/Teams/OpsGenie, investigation workflows, custom retention, dedicated support (8h SLA) |
| **MSSP** | **$4,999/mo base + $199/tenant** | Cross-tenant detection, cross-tenant Aletheia policy push, multi-tenant dashboards |

Annual billing: 17% discount (2 months free). Also available as part of the Tiresias Platform bundle (save up to 18%).

---

## Use Cases

**SOC Integration** - Feed agent security events into your existing Splunk/Elastic SIEM with Sigma-compatible rules your detection engineers already know.

**Behavioral Threat Detection** - Detect compromised or misbehaving agents through behavioral baseline deviations, not payload inspection.

**Automated Incident Response** - Reduce MTTR with automated quarantine playbooks that isolate threats within seconds of detection.

**Compliance Monitoring** - Continuously generate compliance reports for SOC2, ISO 27001, and NIST 800-53 audits.

---

*Saluca LLC | tiresias.network/platform/soulwatch*
