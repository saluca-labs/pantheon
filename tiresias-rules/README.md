# Tiresias Detection Rules -- AI Agent Security Content

[![Rules](https://img.shields.io/badge/detection_rules-36-blue)](rules/)
[![Playbooks](https://img.shields.io/badge/response_playbooks-6-green)](playbooks/)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange)](LICENSE)

Open-source, Sigma-compatible detection rules and response playbooks for **AI agent runtime security**. Built for [Tiresias](https://tiresias.network) -- the security monitoring platform purpose-built for autonomous AI agent infrastructure.

## What is Tiresias?

Tiresias is a real-time security monitoring and detection platform designed for environments where AI agents operate autonomously -- calling tools, accessing data, authenticating to services, and communicating with other agents. Traditional SIEM rules were built for human-driven workflows. Tiresias rules target the distinct threat patterns that emerge when AI agents are the principals.

This repository contains the community detection rule library and response playbooks that ship with Tiresias. Rules are written in a Sigma-compatible YAML format extended with Tiresias-specific fields for agent telemetry, SoulKey authentication, and multi-tenant isolation.

For more information, visit [tiresias.network](https://tiresias.network).

## Rule Categories

| Category | Rules | Description |
|----------|------:|-------------|
| [Credential](rules/credential/) | 6 | SoulKey brute force, replay, revocation abuse, session hijacking, off-hours auth |
| [Exfiltration](rules/exfiltration/) | 6 | Bulk data reads, slow exfiltration, encoding-based data smuggling |
| [Injection](rules/injection/) | 8 | Direct/indirect prompt injection, delimiter exploitation, role hijacking |
| [Tool Abuse](rules/tool-abuse/) | 5 | Unauthorized tool invocation, parameter tampering, tool chaining abuse |
| [Lateral Movement](rules/lateral-movement/) | 4 | Cross-agent pivoting, service mesh traversal, trust relationship exploitation |
| [Supply Chain](rules/supply-chain/) | 4 | Model version tampering, provider endpoint changes, plugin substitution |
| [Persistence](rules/persistence/) | 3 | Scheduled task creation, memory injection, configuration modification |
| [Evasion](rules/evasion/) | 0* | Audit bypass, log tampering, steganographic hiding |

\* Evasion rules are in development. Response playbook [pb-006](playbooks/pb-006-forensic-capture.yml) is ready for when they land.

**Total: 36 detection rules, 6 response playbooks**

## Quick Start

### Load rules into Tiresias

```bash
# Clone the rule repository
git clone https://github.com/salucallc/tiresias-rules.git
cd tiresias-rules

# Load all rules into a running Tiresias instance
tiresias rules load ./rules/ --recursive

# Load playbooks
tiresias playbooks load ./playbooks/

# Validate rules before loading
tiresias rules validate ./rules/ --recursive --strict

# Load a specific category
tiresias rules load ./rules/credential/
```

### Use with Sigma toolchain

Rules are Sigma-compatible and can be converted to other SIEM formats:

```bash
# Convert to Splunk SPL
sigma convert -t splunk -p sysmon rules/credential/credential-001-brute-force.yml

# Convert to Elasticsearch
sigma convert -t elasticsearch rules/exfiltration/exfil-001-bulk-data-read.yml
```

> **Note:** Tiresias-specific extensions (baseline comparisons, SoulKey fields, tenant isolation) require the Tiresias backend and are not available in generic Sigma conversions.

## Rule Format Specification

Each rule is a YAML file following the Sigma specification with Tiresias extensions:

```yaml
title: Human-readable rule name
id: <category>-<number>          # e.g., credential-001, exfil-002
status: stable|experimental|test
level: critical|high|medium|low
description: |
  Multi-line description of what the rule detects and why it matters.
author: Saluca LLC
date: YYYY/MM/DD
references:
  - https://attack.mitre.org/techniques/TXXXX/
  - https://tiresias.network/docs/rules/<rule-id>
tags:
  - attack.<tactic>              # MITRE ATT&CK tactic
  - mitre.<technique>            # MITRE ATT&CK technique ID
  - mitre_atlas.<technique>      # MITRE ATLAS technique ID (AI-specific)
  - tiresias.<component>         # Tiresias component tag

logsource:
  product: tiresias
  service: <service>             # soulauth, soulgate, tool_invocation, model_router
  category: <category>           # optional: ai_agent_telemetry

detection:
  selection:
    event_type: <event>
    <field>: <value>
    <field>|<modifier>:          # Sigma modifiers: contains, endswith, re, etc.
      - <value>
  filter_<name>:                 # Optional filters to reduce false positives
    <field>: <value>
  condition: selection and not filter_<name>
  timeframe: <duration>          # Optional: sliding window (e.g., 5m, 1h)
  threshold:                     # Optional: count-based threshold
    field: <field>
    gte: <int>
  group_by:                      # Optional: aggregation fields
    - <field>

  # Tiresias extension: baseline comparison
  baseline:
    tiresias_baseline:
      metric: <metric_name>
      lookback: <duration>       # Rolling baseline window (e.g., 7d)
      deviation: <float>         # Standard deviations from baseline
      mode: and|or               # Combine with threshold

fields:                          # Fields included in the alert output
  - <field_name>

falsepositives:
  - Description of known false positive scenarios

response_playbook: <playbook-id> # Optional: linked response playbook
```

### Key Tiresias Extensions

- **`tiresias_baseline`** -- Compare current values against a rolling per-agent baseline to reduce false positives for high-throughput agents.
- **`logsource.service`** -- Tiresias-specific log sources: `soulauth` (authentication), `soulgate` (API gateway), `tool_invocation` (tool calls), `model_router` (model selection).
- **`response_playbook`** -- Links a rule to an automated response playbook.

## Playbook Format Specification

Response playbooks define automated actions triggered by rule detections:

```yaml
id: <playbook-id>                # e.g., pb-001
title: Human-readable playbook name
description: |
  What this playbook does and when it executes.
version: "1.0"
author: Saluca LLC
severity: critical|high|medium|low

triggers:
  - rule_id: <rule-id>          # Trigger on specific rule
  - level: <level>              # Trigger on any rule at this severity

actions:
  - type: <action-type>
    description: What this action does
    config:
      # Action-specific configuration
      # Supports template variables: {{ alert.<field> }}, {{ env.<var> }}

cooldown_minutes: <int>|null     # Minimum time between executions (null = no cooldown)
requires_approval: true|false    # Whether human approval is needed before execution

notification_channels:
  - slack
  - pagerduty
  - email
  - webhook
```

### Action Types

| Action | Description |
|--------|-------------|
| `suspend_key` | Suspend or revoke a SoulKey |
| `kill_sessions` | Terminate active agent sessions |
| `rate_limit` | Apply request rate limiting |
| `block_request` | Block a specific request |
| `isolate_tenant` | Isolate a tenant's network segment |
| `enhanced_logging` | Enable verbose logging or freeze logs to immutable storage |
| `notify` | Send notifications via Slack, PagerDuty, email, or webhook |
| `create_incident` | Create an incident ticket in the configured ITSM |
| `forensic_capture` | Capture and preserve forensic evidence with chain of custody |

### Included Playbooks

| Playbook | Severity | Approval | Description |
|----------|----------|----------|-------------|
| [pb-001](playbooks/pb-001-auto-quarantine.yml) | Critical | Automatic | Quarantine agent: suspend SoulKey, kill sessions, page SOC |
| [pb-002](playbooks/pb-002-rate-limit.yml) | High | Automatic | Rate limit to 5 req/60s, enhanced logging, Slack alert |
| [pb-003](playbooks/pb-003-investigate.yml) | Medium | Automatic | Enhanced monitoring, SIEM webhook, investigation queue |
| [pb-004](playbooks/pb-004-block-and-review.yml) | High | Required | Block request, preserve evidence, queue for human review |
| [pb-005](playbooks/pb-005-tenant-isolation.yml) | Critical | Automatic | Full tenant isolation, manual reset only |
| [pb-006](playbooks/pb-006-forensic-capture.yml) | Critical | Automatic | Immutable evidence capture, legal hold, compliance notify |

## Coverage Matrix

### MITRE ATT&CK Mapping

| Tactic | Techniques Covered | Rules |
|--------|--------------------|-------|
| Credential Access | T1110, T1078, T1078.004, T1528, T1563 | credential-001 through credential-006 |
| Exfiltration | T1048, T1030, T1132 | exfil-001 through exfil-006 |
| Initial Access | T1190, T1195 | injection-001, supply-001, supply-002 |
| Execution | T1059, T1203 | tool-abuse-* |
| Lateral Movement | T1021, T1563, T1199 | lateral-movement-* |
| Persistence | T1053, T1098, T1543 | persistence-* |
| Defense Evasion | T1070, T1562, T1001 | evasion-* (planned) |

### MITRE ATLAS Mapping (AI-Specific)

| Technique | Description | Rules |
|-----------|-------------|-------|
| AML.T0051 | LLM Prompt Injection | injection-* |
| AML.T0010 | ML Supply Chain Compromise | supply-* |
| AML.T0048 | Exfiltration via ML API | exfil-* |
| AML.T0040 | ML Model Inference API Access | credential-*, lateral-movement-* |
| AML.T0015 | Evade ML Model | evasion-* (planned) |

## Contributing

We welcome contributions from the AI security community. To contribute:

1. **Fork** this repository.
2. **Create a branch** for your rule or playbook: `git checkout -b rule/my-new-detection`.
3. **Follow the format** specified above. Use an existing rule as a template.
4. **Assign an ID** following the `<category>-<NNN>` convention with the next available number.
5. **Include at minimum:**
   - Clear `title` and `description` explaining what and why
   - Accurate `tags` with MITRE ATT&CK/ATLAS mappings
   - At least one `falsepositives` entry
   - Relevant `fields` for alert output
6. **Validate** your rule: `tiresias rules validate <your-rule.yml> --strict`
7. **Submit a pull request** with a description of the threat scenario your rule addresses.

### Rule Quality Checklist

- [ ] Rule has a clear, specific title
- [ ] Description explains the threat model, not just the detection logic
- [ ] At least one MITRE ATT&CK or ATLAS tag
- [ ] False positives documented
- [ ] Detection logic tested against sample telemetry
- [ ] Status set to `experimental` for new rules

### Reporting Issues

If you find a false positive, detection gap, or have a rule request, please [open an issue](https://github.com/salucallc/tiresias-rules/issues).

## Directory Structure

```
tiresias-rules/
├── LICENSE                        # Apache 2.0
├── README.md                      # This file
├── rules/
│   ├── credential/                # 6 rules
│   ├── evasion/                   # Planned
│   ├── exfiltration/              # 6 rules
│   ├── injection/                 # 8 rules
│   ├── lateral-movement/          # 4 rules
│   ├── persistence/               # 3 rules
│   ├── supply-chain/              # 4 rules
│   └── tool-abuse/                # 5 rules
└── playbooks/
    ├── pb-001-auto-quarantine.yml
    ├── pb-002-rate-limit.yml
    ├── pb-003-investigate.yml
    ├── pb-004-block-and-review.yml
    ├── pb-005-tenant-isolation.yml
    └── pb-006-forensic-capture.yml
```

## License

Copyright 2026 Saluca LLC

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.

---

Built by [Saluca LLC](https://saluca.co) for the [Tiresias](https://tiresias.network) project.
