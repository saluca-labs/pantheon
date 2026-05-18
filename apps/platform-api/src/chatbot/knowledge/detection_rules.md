# Tiresias Detection Rules Reference

> _This document is part of the Tiresias App Proxy knowledge base — the App Proxy stays branded Tiresias under the Pantheon umbrella. See ADR-013 in `docs/decisions/` for the carve-out._

## Sigma Rule Format

Tiresias uses a subset of the Sigma rule specification for detection rules.
Each rule is a YAML document with the following structure:

```yaml
title: Prompt Injection Detected
description: Detects common prompt injection patterns in agent requests
status: experimental
logsource:
  product: tiresias
  service: agent_proxy
detection:
  keywords:
    - "ignore previous instructions"
    - "disregard your system prompt"
    - "you are now"
    - "pretend you are"
  condition: keywords
falsepositives:
  - Legitimate testing of safety features
level: high
tags:
  - attack.prompt_injection
```

## Rule Fields

- title: Short human-readable name (required)
- description: What the rule detects (recommended)
- status: experimental | stable | deprecated
- logsource.product: always "tiresias"
- logsource.service: agent_proxy | audit | anomaly
- detection: keyword lists, field comparisons, or combinations
- condition: boolean expression over detection blocks
- level: low | medium | high | critical
- tags: arbitrary labels for categorization

## Example Rules

### Off-Hours Access Detection
```yaml
title: Off-Hours Agent Activity
description: Detects agent activity outside business hours (9AM-6PM UTC)
logsource:
  product: tiresias
  service: agent_proxy
detection:
  timefilter:
    hour|lt: 9
    hour|gt: 18
  condition: timefilter
level: medium
```

### Excessive Token Usage
```yaml
title: Excessive Token Usage
description: Detects requests exceeding 8000 tokens (potential data exfiltration)
logsource:
  product: tiresias
  service: agent_proxy
detection:
  selection:
    total_tokens|gt: 8000
  condition: selection
level: high
tags:
  - attack.data_exfiltration
```

### Model Abuse Pattern
```yaml
title: Unusual Model Switching
description: Detects rapid switching between models (evasion pattern)
logsource:
  product: tiresias
  service: agent_proxy
detection:
  selection:
    distinct_models_1h|gt: 5
  condition: selection
level: medium
```

## Managing Rules

### Create a Rule
POST /v1/detection/rules with the YAML content in the "content" field.
Or use the dashboard at Detection > Rules > New Rule.

### Edit a Rule
In the dashboard, click a rule to open the YAML editor panel. Make changes and click Save.
Or PUT /v1/detection/rules/{rule_id}.

### Enable/Disable a Rule
Toggle the switch in the rule list, or PATCH /v1/detection/rules/{rule_id} with {"enabled": false}.

### Test a Rule
In the rule editor, click "Test Rule" and paste a sample event JSON.
Or POST /v1/detection/rules/test with {"rule_id": "...", "event": {...}}.

## Playbooks

Playbooks define automated responses to rule matches.
Each playbook has:
- trigger_rules: list of rule IDs that activate this playbook
- severity_threshold: minimum severity level to trigger
- actions: list of response actions (quarantine, alert, notify)
- cooldown_seconds: minimum time between activations (prevents storm)
- requires_approval: if true, action is queued for human approval

View playbooks at Detection > Playbooks.

## Anomaly Types

The anomaly detector covers 18 behavioral types:
rate_spike, unusual_resource, off_hours, geo_anomaly, scope_escalation,
credential_rotation, session_hijack, model_abuse, token_harvesting, data_poisoning,
lateral_movement, persistence, evasion, supply_chain, resource_abuse,
policy_violation, baseline_deviation, frequency_anomaly

Each anomaly has severity (low/medium/high/critical) and evidence dict.
View in real-time at Detection > Detection Feed.
