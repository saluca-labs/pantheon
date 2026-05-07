# Tiresias Analyst Guide

*AI Agent Security Platform -- Action Monitoring & Investigation*

**Version:** 1.0
**Last updated:** 2026-04-04
**Audience:** Security analysts responsible for monitoring agent behavior, investigating anomalies, and writing detection rules

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Action Audit Log Reference](#2-action-audit-log-reference)
3. [Behavioral Baselines for Actions](#3-behavioral-baselines-for-actions)
4. [Anomaly Detection for Agent Actions](#4-anomaly-detection-for-agent-actions)
5. [Investigation Workflows](#5-investigation-workflows)
6. [Sigma Rules for Action Monitoring](#6-sigma-rules-for-action-monitoring)
7. [Dashboard Views for Action Metrics](#7-dashboard-views-for-action-metrics)

---

## 1. Introduction

This guide is for security analysts who monitor agent behavior through Tiresias. Your job is to understand what agents are doing, spot when something looks wrong, investigate why, and write detection logic to catch it next time.

Tiresias routes every agent action -- posting a message, reacting to content, creating a channel, sending a DM -- through the SoulGate action pipeline. Every action is authenticated, evaluated against policy, forwarded for execution, and logged. The result is a complete audit trail of every side-effect every agent has ever produced.

The action pipeline currently operates in **monitor-only mode**. All actions are permitted, but everything is logged. This is the baseline-building phase. When enforcement is enabled, the policy engine will begin denying actions that violate configured rules. Your work during monitor-only mode directly informs what those rules look like.

---

## 2. Action Audit Log Reference

Every action that passes through SoulGate is recorded in the `_soulgate_action_log` table. This is your primary data source for action-level investigation.

### Table Schema

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key. Auto-generated. |
| `tenant_id` | UUID | Tenant that owns the agent. |
| `soulkey_id` | UUID | The SoulKey used to authenticate the action. |
| `persona_id` | string | Agent persona name (e.g., `alfred`, `researcher`). |
| `action_id` | UUID | Unique action identifier. Set by the submitting agent. |
| `action_type` | string | Type of action: `POST_MESSAGE`, `REPLY_IN_THREAD`, `REACT`, `DM`, `SHARE_LINK`, `PIN_MESSAGE`, `CREATE_CHANNEL`, `DO_NOTHING`. |
| `target_platform` | string | Target platform (e.g., `slack`). |
| `target_channel` | string | Target channel or conversation. |
| `decision` | string | Policy decision: `permit` or `deny`. |
| `policy_name` | string | Name of the policy that produced the decision (null for `permit` in monitor-only mode). |
| `rule_name` | string | Name of the specific rule within the policy (null for `permit` in monitor-only mode). |
| `downstream_status` | integer | HTTP status code returned by the execution service. Null if the action was denied before forwarding. |
| `response_time_ms` | float | Total pipeline processing time in milliseconds. |
| `simulation_id` | string | If this was a simulation/test action, the simulation identifier. Null for production actions. |
| `source_ip` | string | Client IP address of the submitting agent. |
| `created_at` | timestamp | When the action was processed (UTC). |

### Indexed Columns

The following columns are indexed for fast queries:

- `tenant_id` -- filter by tenant
- `persona_id` -- filter by agent
- `created_at` -- time-range queries
- `action_type` -- filter by action category

### Key Fields for Investigation

When triaging an action, focus on these fields first:

- **`persona_id`** -- which agent did this?
- **`action_type`** -- what kind of action was it?
- **`target_channel`** -- where was the action directed?
- **`decision`** -- was it permitted or denied?
- **`downstream_status`** -- did the execution succeed?
- **`response_time_ms`** -- was there unusual latency?
- **`source_ip`** -- does the origin match expected infrastructure?

### Example Queries

**All actions by a specific agent in the last hour:**

```sql
SELECT action_type, target_channel, decision, downstream_status, created_at
FROM _soulgate_action_log
WHERE persona_id = 'alfred'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**All denied actions across the tenant:**

```sql
SELECT persona_id, action_type, policy_name, rule_name, created_at
FROM _soulgate_action_log
WHERE tenant_id = '<your-tenant-id>'
  AND decision = 'deny'
ORDER BY created_at DESC
LIMIT 100;
```

**Action volume by type over the last 24 hours:**

```sql
SELECT action_type,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE decision = 'deny') AS denied,
       AVG(response_time_ms) AS avg_latency_ms
FROM _soulgate_action_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY action_type
ORDER BY total DESC;
```

**Actions to a specific channel with high latency:**

```sql
SELECT persona_id, action_type, response_time_ms, downstream_status, created_at
FROM _soulgate_action_log
WHERE target_channel = '#production-alerts'
  AND response_time_ms > 5000
ORDER BY created_at DESC;
```

**Filter out simulation/test actions:**

```sql
SELECT *
FROM _soulgate_action_log
WHERE simulation_id IS NULL
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## 3. Behavioral Baselines for Actions

SoulWatch builds behavioral baselines from observed activity. For agent actions, the relevant baseline dimensions are:

### What Is Tracked

| Dimension | How It Is Measured |
|---|---|
| Action rate | Actions per minute, per agent, over the baseline window |
| Action type distribution | Which action types the agent normally uses and in what proportion |
| Target channels | Which channels the agent normally sends actions to |
| Active hours | When the agent normally submits actions |
| Denial rate | Percentage of actions that result in policy denials |
| Latency profile | Typical response time distribution for the agent's actions |

### Interpreting Baselines

A baseline tells you what "normal" looks like for a specific agent. Deviations from the baseline are what trigger anomaly detection. When reviewing baselines, ask:

- **Is the action rate stable?** A researcher agent that normally sends 5 messages per hour suddenly sending 50 is a signal. An agent that has always been bursty is not.
- **Is the action type distribution consistent?** An agent that only posts messages suddenly sending DMs or creating channels is worth investigating.
- **Are the target channels expected?** An agent that normally posts to `#team-updates` suddenly sending to `#executive-leadership` or `#finance` could indicate lateral movement or misconfiguration.
- **Is the timing normal?** Actions outside the agent's established operating window are suspicious, especially if the agent has time-window constraints in its policy.

### Baseline Lifecycle

- **Build period**: 7 days of audit data
- **Refresh cycle**: every 6 hours
- **Cold-start period**: new agents have limited anomaly detection for their first 7 days. Use explicit Sigma rules with absolute thresholds to cover this gap.

---

## 4. Anomaly Detection for Agent Actions

The existing SoulWatch anomaly types (RATE_SPIKE, OFF_HOURS, NEW_RESOURCE, etc.) apply to actions as well. For action-specific monitoring, pay attention to these patterns:

### Action-Specific Anomaly Patterns

#### Volume Spike

An agent's action rate suddenly jumps well above its baseline. This could indicate:

- A runaway loop in the agent's logic
- A compromised SoulKey being used to flood a channel
- A misconfigured agent processing a backlog

**What to check**: look at the `action_type` and `target_channel` columns for the spike period. Is the agent repeating the same action to the same target? That's likely a loop. Are the targets varied? That's more concerning.

#### New Target

An agent sends an action to a channel or platform it has never targeted before. This could indicate:

- Legitimate new functionality being deployed
- An agent's context being manipulated to direct output to an unintended target
- A compromised key being used to probe available channels

**What to check**: correlate the new target with the agent's recent conversation context (if available through SoulWatch event feed). Was there a prompt or instruction that directed the agent to the new target?

#### Action Type Shift

An agent's action type distribution changes significantly. An agent that has only ever posted messages suddenly sending DMs or creating channels.

**What to check**: review the agent's recent actions in chronological order. Did the shift happen abruptly (one action to the next) or gradually? Abrupt shifts are more suspicious.

#### Denial Clustering

Multiple denials from the same agent in a short window. This looks like the agent is probing for what it can do -- a reconnaissance pattern.

**What to check**: look at the `policy_name` and `rule_name` columns for the denied actions. Are the denials all hitting the same rule (the agent is repeatedly trying one thing) or different rules (the agent is exploring)?

#### Latency Anomaly

An agent's actions suddenly take much longer to process. This could indicate:

- Downstream service degradation
- An unusually large payload
- Network issues between SoulGate and the execution service

**What to check**: compare `response_time_ms` for the anomalous actions against the agent's typical latency profile. Check `downstream_status` -- are there 5xx errors correlating with the latency spike?

---

## 5. Investigation Workflows

### Workflow 1: Action Denied -- Why?

An agent's action was denied by policy. Determine why and whether the denial is correct.

1. **Pull the denial record:**

    ```sql
    SELECT persona_id, action_type, target_channel, policy_name, rule_name, created_at
    FROM _soulgate_action_log
    WHERE action_id = '<action-uuid>'
      AND decision = 'deny';
    ```

2. **Identify the policy and rule.** The `policy_name` tells you which policy document was evaluated. The `rule_name` tells you which specific rule within that policy triggered the denial.

3. **Review the policy definition.** In the dashboard, navigate to **Policies > [policy_name]** and find the rule. Understand the conditions: what action types, target platforms, channels, or time windows does the rule restrict?

4. **Determine if the denial is correct:**
    - If the agent should not have been performing that action, the denial is working as intended. No further action needed.
    - If the agent should have been allowed, the policy may need adjustment. Escalate to the tenant admin with the action ID, the policy name, and your assessment.

5. **Check for patterns.** Query for other denials from the same agent or the same policy in the same time window:

    ```sql
    SELECT action_type, target_channel, rule_name, created_at
    FROM _soulgate_action_log
    WHERE persona_id = '<persona>'
      AND decision = 'deny'
      AND created_at > NOW() - INTERVAL '1 hour'
    ORDER BY created_at;
    ```

### Workflow 2: Suspicious Agent Activity

An alert fires or you notice unusual activity from an agent. Determine scope and severity.

1. **Establish the timeline.** Pull all actions from the agent in the relevant window:

    ```sql
    SELECT action_type, target_channel, decision, downstream_status,
           response_time_ms, source_ip, created_at
    FROM _soulgate_action_log
    WHERE persona_id = '<persona>'
      AND created_at BETWEEN '<start>' AND '<end>'
    ORDER BY created_at;
    ```

2. **Compare against baseline.** Look at the agent's normal action volume, type distribution, and target channels. What changed?

3. **Check the source.** Is the `source_ip` consistent with the agent's normal infrastructure? An action from an unexpected IP is a strong indicator of key compromise.

4. **Correlate with SoulWatch events.** Check the event feed for anomaly detections, quarantine actions, or auth events involving the same agent in the same window:

    ```bash
    curl -H "X-Soulkey: sk_agent_acme_admin_..." \
      "https://tiresias.network/v1/watch/events?agent=<persona>&since=1h"
    ```

5. **Assess impact.** How many actions were executed? To which targets? Were any actions directed at sensitive channels? Did any downstream services return errors?

6. **Recommend response.** Based on severity:
    - **Low** (unusual but explainable): document and monitor
    - **Medium** (anomalous, no clear explanation): request the agent owner to review their agent's logic
    - **High** (likely compromise or policy violation): recommend key suspension via the quarantine system

### Workflow 3: Downstream Failure Investigation

An agent's actions are failing at the execution layer. Determine whether this is a SoulGate issue, a downstream issue, or an agent issue.

1. **Pull failed actions:**

    ```sql
    SELECT persona_id, action_type, target_channel, downstream_status,
           response_time_ms, created_at
    FROM _soulgate_action_log
    WHERE downstream_status >= 400
      AND created_at > NOW() - INTERVAL '1 hour'
    ORDER BY created_at DESC;
    ```

2. **Categorize the failures:**
    - `4xx` errors: the action payload is malformed or the target is invalid. This is an agent-side issue.
    - `5xx` errors: the execution service is failing. This is a downstream issue.
    - `502`/`504` (from SoulGate itself): the execution service is unreachable or timing out.

3. **Check if the failures are agent-specific or platform-wide.** If only one agent is failing, the issue is likely in that agent's action payloads. If all agents are failing, the execution service is down.

---

## 6. Sigma Rules for Action Monitoring

SoulWatch supports Sigma-compatible detection rules. The following examples are tailored to action pipeline monitoring. Upload them via the API or the dashboard rule editor.

### Rule: High-Volume Action Burst

Detects an agent submitting an unusually high number of actions in a short window.

```yaml
title: Agent Action Burst
id: rule_action_burst_001
status: active
description: >
  Detects a single agent submitting more than 30 actions within
  a 5-minute window. May indicate a runaway loop or compromised key.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    action_type: "*"
  condition: selection
  aggregation:
    count: true
    threshold: 30
    window: 300
    group_by: persona_id
level: high
tags:
  - agent_abuse
  - runaway_loop
```

### Rule: DM to External User

Detects an agent attempting to send a direct message. DMs are harder to audit through channel-level monitoring, making them a higher-risk action type.

```yaml
title: Agent Direct Message
id: rule_action_dm_001
status: active
description: >
  Fires when any agent submits a DM action. DMs bypass channel-level
  visibility and should be reviewed for data exfiltration risk.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    action_type: "DM"
  condition: selection
level: medium
tags:
  - data_exfiltration
  - lateral_communication
```

### Rule: Channel Creation

Detects an agent creating a new channel. Channel creation changes the workspace structure and may indicate an agent attempting to establish a private communication path.

```yaml
title: Agent Channel Creation
id: rule_action_channel_create_001
status: active
description: >
  Fires when an agent creates a new channel. Review the channel name
  and purpose to ensure it is consistent with the agent's role.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    action_type: "CREATE_CHANNEL"
  condition: selection
level: medium
tags:
  - workspace_modification
  - persistence
```

### Rule: Off-Hours Action Activity

Detects actions submitted outside of business hours. Combine with SoulWatch's OFF_HOURS anomaly for correlation.

```yaml
title: Off-Hours Agent Action
id: rule_action_off_hours_001
status: active
description: >
  Fires when an agent submits an action between 22:00 and 06:00 UTC.
  Adjust the time window to match your operational hours.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    action_type: "*"
  condition: selection
  timeframe:
    after: "22:00"
    before: "06:00"
    timezone: "UTC"
level: medium
tags:
  - off_hours
  - anomalous_timing
```

### Rule: Repeated Denials from Single Agent

Detects an agent receiving multiple policy denials in a short window, which may indicate reconnaissance or misconfiguration.

```yaml
title: Action Denial Cluster
id: rule_action_denial_cluster_001
status: active
description: >
  Fires when a single agent receives 5 or more action denials
  within 10 minutes. May indicate the agent is probing policy boundaries.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    decision: "deny"
  condition: selection
  aggregation:
    count: true
    threshold: 5
    window: 600
    group_by: persona_id
level: high
tags:
  - reconnaissance
  - policy_probing
```

### Rule: Action to Sensitive Channel

Detects actions targeting channels that are designated as sensitive. Customize the channel list for your environment.

```yaml
title: Action to Sensitive Channel
id: rule_action_sensitive_channel_001
status: active
description: >
  Fires when an agent sends an action to a channel on the sensitive
  channel list. Review the action content and agent authorization.
logsource:
  product: tiresias
  service: soulgate_action_log
detection:
  selection:
    target_channel:
      - "#executive-leadership"
      - "#finance"
      - "#legal"
      - "#security-incidents"
      - "#hr-confidential"
  condition: selection
level: high
tags:
  - sensitive_target
  - data_exfiltration
```

---

## 7. Dashboard Views for Action Metrics

The Tiresias dashboard provides several views for monitoring agent actions. Access them at [tiresias.network/dashboard](https://tiresias.network/dashboard) after signing in.

### Action Volume Timeline

**Location:** Dashboard > SoulGate > Actions

A time-series chart showing total actions per minute, broken down by `action_type`. Use this to:

- Spot volume spikes in real time
- Identify trends (growing action volume as agents scale)
- Correlate volume changes with deployments or configuration changes

**Filters:** tenant, persona, action type, time range.

### Decision Breakdown

**Location:** Dashboard > SoulGate > Actions > Decisions

A pie chart and table showing the ratio of `permit` to `deny` decisions. During monitor-only mode, this will show 100% permit. When enforcement is enabled, use this view to:

- Monitor the overall denial rate
- Identify which policies are producing the most denials
- Spot agents with unusually high denial rates

### Per-Agent Action Profile

**Location:** Dashboard > Agents > [persona] > Actions

A detailed view of a single agent's action history:

- **Action type distribution**: which types of actions the agent submits
- **Target channels**: where the agent sends actions
- **Timeline**: action volume over time
- **Latency**: response time distribution
- **Denials**: recent denied actions with policy and rule details

Use this view during investigations to quickly understand an agent's normal behavior and identify deviations.

### Latency Heatmap

**Location:** Dashboard > SoulGate > Actions > Latency

A heatmap showing response time by action type and time of day. Useful for:

- Identifying downstream performance degradation
- Spotting action types that consistently run slow
- Correlating latency spikes with volume spikes

### Audit Log (Action-Filtered)

**Location:** Dashboard > Audit > Action Log

The full audit log viewer, pre-filtered to action events. Supports:

- **Search**: by persona, action type, target channel, decision
- **Time range**: adjustable from last 15 minutes to last 90 days
- **Export**: CSV or JSON for offline analysis or SIEM ingestion
- **Detail view**: click any row to see the full action record, including request payload, policy evaluation result, and downstream response

---

*Built by Saluca LLC. For more information, visit [tiresias.network](https://tiresias.network).*
