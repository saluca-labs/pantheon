# SoulWatch - Product Datasheet

**AI Runtime Security Monitoring**

---

## Overview

SoulWatch provides real-time behavioral monitoring and threat detection for AI agent fleets. It learns normal agent behavior, detects anomalies, and triggers automated responses - all without ever accessing the data your agents handle.

Built for security operations teams, SoulWatch integrates directly into existing SOC workflows with Sigma-compatible detection rules, native SIEM forwarding, and enterprise notification routing.

**Status**: Generally Available
**Version**: 1.0
**Deployment**: Docker sidecar alongside SoulAuth

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

### Enterprise Notifications
- PagerDuty incident creation
- Slack channel alerts
- Microsoft Teams webhooks
- OpsGenie alert integration

---

## Technical Specifications

| Specification | Detail |
|---|---|
| API | RESTful, 27 endpoints |
| Architecture | Async event pipeline |
| Live Feed | WebSocket real-time stream |
| Detection | Sigma-compatible rule engine |
| Anomaly Types | 8 (behavioral, temporal, volumetric) |
| Response Actions | 7 graduated levels |
| SIEM Targets | 5 (Splunk, Elastic, Sentinel, Syslog, Webhook) |
| Reliability | Dead letter queue for SIEM delivery |
| Database | PostgreSQL 16 (shared cluster, isolated tables) |
| Monitoring | 8 Prometheus metrics, health checks |
| Compliance | SOC2, ISO 27001, NIST 800-53 reports |
| Container | Docker sidecar |

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

| Tier | Price | Includes |
|---|---|---|
| **Starter** | $10/agent/mo | 8 anomaly types, behavioral baselines, 7 Sigma rules, risk scoring, 7-day retention, email alerts |
| **Pro** | $20/agent/mo | Everything in Starter + custom Sigma rules, response playbooks with auto-quarantine, 30-day retention, 1 SIEM destination, WebSocket live feed, email support (24h) |
| **Enterprise** | Custom | Everything in Pro + 90-day retention, unlimited SIEM destinations, SOC2/ISO/NIST reports, PagerDuty/Slack/Teams/OpsGenie, investigation workflows, dedicated account manager, 99.99% SLA |

Annual billing: 20% discount. Also available as part of the Tiresias Platform bundle (save up to 18%).

---

## Use Cases

**SOC Integration** - Feed agent security events into your existing Splunk/Elastic SIEM with Sigma-compatible rules your detection engineers already know.

**Behavioral Threat Detection** - Detect compromised or misbehaving agents through behavioral baseline deviations, not payload inspection.

**Automated Incident Response** - Reduce MTTR with automated quarantine playbooks that isolate threats within seconds of detection.

**Compliance Monitoring** - Continuously generate compliance reports for SOC2, ISO 27001, and NIST 800-53 audits.

---

*Saluca LLC | tiresias.network/platform/soulwatch*
