# Tiresias App Proxy -- Compliance Guide

**Version:** 0.1.0
**Last updated:** 2026-04-05
**Audience:** Compliance officers, auditors, GRC analysts, CISOs

---

## Table of Contents

1. [Supported Frameworks](#1-supported-frameworks)
2. [SOC 2 Type II Control Mapping](#2-soc-2-type-ii-control-mapping)
3. [NIST AI Risk Management Framework Control Mapping](#3-nist-ai-risk-management-framework-control-mapping)
4. [EU AI Act Control Mapping](#4-eu-ai-act-control-mapping)
5. [Generating Compliance Reports](#5-generating-compliance-reports)
6. [Gap Analysis](#6-gap-analysis)
7. [Audit Preparation](#7-audit-preparation)
8. [EU AI Act Article 14 -- Human Oversight](#8-eu-ai-act-article-14----human-oversight)
9. [Continuous Compliance Monitoring](#9-continuous-compliance-monitoring)

---

## 1. Supported Frameworks

The Tiresias App Proxy provides built-in control mappings and evidence generation for three compliance frameworks:

| Framework | Version | Scope | Controls Mapped |
|---|---|---|---|
| SOC 2 Type II | Trust Services Criteria (2017) | AI agent action governance | 7 controls |
| NIST AI RMF | 1.0 (January 2023) | AI risk management | 6 controls |
| EU AI Act | Regulation (EU) 2024/1689 | Human oversight of high-risk AI | 4 controls |

Each control definition specifies:

- **Control ID** -- the framework's official identifier.
- **Name** -- human-readable control name.
- **Description** -- the requirement text.
- **Evidence criteria** -- what audit data proves compliance.

The compliance API generates reports that map audit log data to these controls, identifying which controls have evidence and which have gaps.

---

## 2. SOC 2 Type II Control Mapping

### CC6.1 -- Logical Access Security

**Requirement:** The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events.

**How Tiresias satisfies this:**
- Every tool call is evaluated against Cedar policies before dispatch. The `policy_decision` field is present on every audit record.
- The Cedar policy engine runs before any action reaches a plugin, enforcing authorization at the proxy layer.
- Authentication is required for all agent traffic when `APP_PROXY_API_KEY_HASH` is configured.

**Evidence type:** Audit log records showing `policy_decision` on every tool call.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC6.2 -- Prior Authorization for Access

**Requirement:** Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.

**How Tiresias satisfies this:**
- High-risk and destructive actions are routed to the approval queue when `APP_PROXY_ENABLE_APPROVAL_QUEUE` is `true`.
- Approved actions record the `approval_status` (approved/denied) and the `resolved_by` identity of the human reviewer.
- No destructive action executes without prior human authorization.

**Evidence type:** Approval queue records with `approval_status == approved` and `resolved_by` identity.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC6.3 -- Role-Based Access

**Requirement:** The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles.

**How Tiresias satisfies this:**
- The Cedar entity model includes `Tiresias::Agent` with a `roles` attribute (set of strings).
- Policy conditions can reference `principal.roles` to enforce role-based access.
- Every policy evaluation includes `agent_id` and `tenant_id` in the context, binding actions to specific identities and organizational units.

**Evidence type:** Audit records showing `agent_id` and `tenant_id` in policy context; Cedar policies referencing roles.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC6.6 -- System Operation Monitoring

**Requirement:** The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.

**How Tiresias satisfies this:**
- The behavioral analyzer detects anomalous patterns (5 threat patterns, including data exfiltration and privilege escalation).
- Every tool call receives a risk score (0-100) computed from 6 weighted factors.
- Behavioral alerts are logged and included in audit records.

**Evidence type:** Behavioral alert records; risk score distributions in audit logs.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC7.1 -- Detection of Unauthorized Activity

**Requirement:** The entity uses detection and monitoring procedures to identify changes to configurations that result in the introduction of new vulnerabilities.

**How Tiresias satisfies this:**
- Risk scores above the critical threshold (76+) trigger automatic blocking.
- The privilege escalation behavioral pattern detects agents attempting configuration changes after only read operations or with insufficient history.
- Cedar policies enforce access controls on admin tools.

**Evidence type:** Audit records with `risk_score` above threshold; behavioral alerts for `privilege_escalation`.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC7.2 -- Incident Detection Monitoring

**Requirement:** The entity monitors system components for anomalies indicative of malicious acts, natural disasters, and errors.

**How Tiresias satisfies this:**
- Data exfiltration pattern detection (read then external send within 5 minutes).
- Privilege escalation detection (new agents or read-only agents accessing admin tools).
- Abnormal tool-call frequency detection (reconnaissance pattern: 5+ reads in 60 seconds).
- Rapid destructive operation detection (3+ destructive calls in 2 minutes).
- Approval circumvention detection (3+ retries after denial).

**Evidence type:** Behavioral alert logs with pattern name, severity, and event details.

**API endpoint:** `GET /compliance/soc2/report`

---

### CC8.1 -- Change Management

**Requirement:** The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.

**How Tiresias satisfies this:**
- Cedar policy files are stored in version control (Git), providing full change history.
- The policy hot-reload mechanism validates policies against the Cedar schema before acceptance. Invalid policies are rejected, and the previous valid set is retained.
- Policy reload events are logged (`cedar_engine.reload`).

**Evidence type:** Git history of `policies/cedar/*.cedar` files; policy reload/validation logs.

**API endpoint:** `GET /compliance/soc2/report`

---

## 3. NIST AI Risk Management Framework Control Mapping

### MAP 1.1 -- Intended Purpose Documented

**Requirement:** The intended purpose, context of use, and potential benefits and costs of the AI system are documented.

**How Tiresias satisfies this:**
- Every audit record includes `plugin_name` (maps to a plugin manifest with declared capabilities and purpose) and `tool_name` (identifies the specific operation).
- Plugin manifests document the intended use of each MCP server.

**Evidence type:** Audit records with `plugin_name` and `tool_name`; plugin manifest files.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

### MAP 1.5 -- Risk Assessment

**Requirement:** Organizational risk tolerances are determined and documented, and the AI system is assessed against them.

**How Tiresias satisfies this:**
- Every tool call receives a risk score (0-100) and risk level classification (`low`, `medium`, `high`, `critical`).
- Risk factors are broken down into 6 named components with individual weights and activation values.
- The risk level maps to a recommendation: allow, review, require approval, or block.

**Evidence type:** Audit records with `risk_score` (0-100) and `risk_level` classification.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

### MEASURE 2.6 -- AI System Monitoring

**Requirement:** The AI system is monitored for performance and behavior using measurable metrics.

**How Tiresias satisfies this:**
- An immutable audit trail records every tool call with decision, risk score, and behavioral analysis.
- The behavioral analyzer tracks patterns over a 30-minute sliding window per agent.
- Structured logs provide real-time observability into system behavior.

**Evidence type:** Audit trail records; behavioral analysis history; structlog output.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

### MANAGE 1.1 -- Risk Response

**Requirement:** A process is implemented to respond to identified risks based on assessed risk levels.

**How Tiresias satisfies this:**
- Critical risk scores (76+) result in an automatic block recommendation.
- Cedar policies can reference risk level in conditions to enforce automatic denial.
- The approval queue intercepts high-risk actions for human review.

**Evidence type:** Audit records showing `policy_decision == deny` when `risk_level == critical`.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

### MANAGE 2.2 -- Human Oversight

**Requirement:** Mechanisms are in place for human oversight and intervention in AI system decisions.

**How Tiresias satisfies this:**
- The approval queue provides human-in-the-loop review for high-risk and destructive actions.
- Each approval record includes `approval_status` (approved/denied) and `resolved_by` (human identity).
- The approval timeout (default 30 minutes) auto-denies unreviewed actions, ensuring no action waits indefinitely.

**Evidence type:** Approval queue records with `approval_status` and `resolved_by`.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

### GOVERN 1.1 -- Policies and Processes

**Requirement:** Policies and processes are in place and enforced to govern the AI system throughout its lifecycle.

**How Tiresias satisfies this:**
- Cedar policy files are auditable, version-controlled, and declarative.
- Policy evaluation is logged for every action (`cedar_engine.authorize` log event).
- Policy hot-reload ensures operational policies are always current.
- Policy validation prevents deployment of malformed policies.

**Evidence type:** Cedar policy files in Git; policy evaluation logs.

**API endpoint:** `GET /compliance/nist_ai_rmf/report`

---

## 4. EU AI Act Control Mapping

### Art 14.1 -- Human Oversight Capability

**Requirement:** High-risk AI systems shall be designed and developed in such a way that they can be effectively overseen by natural persons during the period in which the AI system is in use.

**How Tiresias satisfies this:**
- The approval queue routes destructive and high-risk actions to human reviewers before execution.
- Humans can approve or deny each action with full visibility into the tool name, arguments, risk score, and risk factors.
- The approval timeout ensures actions do not execute without human input.

**Evidence type:** Approval queue records; approval workflow configuration.

**API endpoint:** `GET /compliance/eu_ai_act/report`

---

### Art 14.2 -- Ability to Intervene

**Requirement:** Human oversight shall include the ability to intervene in the operation of the high-risk AI system or interrupt it.

**How Tiresias satisfies this:**
- The admin deny endpoint (`POST /approval/{id}/deny`) allows administrators to reject any pending action.
- `approval_status == denied` is recorded with the identity of the intervening administrator.
- Cedar policy hot-reload allows administrators to deploy a deny-all policy within 30 seconds.
- The admin plugin unload endpoint (`POST /admin/plugins/{name}/unload`) can disable any plugin immediately.

**Evidence type:** Audit records showing `approval_status == denied` with `resolved_by`; deny-all policy deployment logs.

**API endpoint:** `GET /compliance/eu_ai_act/report`

---

### Art 14.3 -- Understanding of System

**Requirement:** Persons assigned to human oversight shall be enabled to correctly interpret the high-risk AI system's output.

**How Tiresias satisfies this:**
- Every tool call response includes a risk factor breakdown showing each factor's name, weight, activation value, and human-readable explanation.
- Cedar policy decisions include `reasons` (policy IDs) explaining why the decision was made.
- Behavioral alerts include human-readable descriptions and recommendations.

**Evidence type:** API responses with risk factor breakdowns; policy reasons in audit records; behavioral alert descriptions.

**API endpoint:** `GET /compliance/eu_ai_act/report`

---

### Art 14.4 -- Ability to Stop

**Requirement:** Persons assigned to human oversight shall be able to decide not to use the high-risk AI system or to otherwise disregard, override, or reverse its output.

**How Tiresias satisfies this:**
- **Plugin unload:** `POST /admin/plugins/{name}/unload` immediately disables a plugin and all its tools.
- **Schedule pause:** Scheduled tool calls can be suspended via the scheduler API.
- **Deny-all policy:** A single Cedar `forbid(principal, action, resource)` rule halts all operations system-wide within 30 seconds (or immediately via `POST /admin/policies/reload`).
- **Approval denial:** Any pending action can be denied, preventing execution.

**Evidence type:** Plugin unload logs; deny-all policy in version control; schedule pause records.

**API endpoint:** `GET /compliance/eu_ai_act/report`

---

## 5. Generating Compliance Reports

### 5.1 API Call

```bash
curl -s -H "Authorization: Bearer <api-key>" \
  https://app-proxy.example.com/compliance/soc2/report | jq .
```

Replace `soc2` with `nist_ai_rmf` or `eu_ai_act` for other frameworks.

### 5.2 Example Output

```json
{
  "framework": "soc2",
  "generated_at": "2026-04-05T14:30:00Z",
  "tenant_id": "a1b2c3d4-...",
  "controls": [
    {
      "id": "CC6.1",
      "name": "Logical Access Security",
      "status": "satisfied",
      "evidence_count": 15423,
      "evidence_summary": "policy_decision present on 100% of tool calls",
      "last_evidence_at": "2026-04-05T14:29:45Z"
    },
    {
      "id": "CC6.2",
      "name": "Prior Authorization for Access",
      "status": "satisfied",
      "evidence_count": 87,
      "evidence_summary": "87 approved actions with human reviewer identity recorded",
      "last_evidence_at": "2026-04-05T13:10:00Z"
    },
    {
      "id": "CC7.2",
      "name": "Incident Detection Monitoring",
      "status": "partial",
      "evidence_count": 3,
      "evidence_summary": "3 behavioral alerts generated; exfiltration detection active",
      "gaps": ["No privilege escalation events detected in reporting period (may indicate no incidents or insufficient testing)"]
    }
  ],
  "overall_status": "partial",
  "gap_count": 1
}
```

### 5.3 Exporting for GRC Platforms

The JSON output is structured for import into GRC platforms:

- **Drata:** Map `controls[].id` to Drata control IDs; upload evidence counts as automated test results.
- **Vanta:** Use the compliance report as evidence for each mapped control.
- **ServiceNow GRC:** Import control status into the compliance module via REST API.

---

## 6. Gap Analysis

### 6.1 Identifying Gaps

A gap exists when a control's `status` is `partial` or `unsatisfied` in the compliance report. Common causes:

| Gap | Cause | Remediation |
|---|---|---|
| No approval records | Approval queue disabled or no destructive actions occurred | Enable `APP_PROXY_ENABLE_APPROVAL_QUEUE`; run a controlled test |
| Low evidence count | Insufficient operational data | Allow the system to accumulate audit data over the reporting period |
| Missing behavioral alerts | No anomalous behavior detected | This may be correct; document that detection is active but no incidents occurred |
| Policy evaluation missing | Cedar engine not initialized | Check startup logs for `cedar.engine.ready` |

### 6.2 Remediation Workflow

1. Generate the compliance report for the target framework.
2. Filter for controls with `status != "satisfied"`.
3. Review the `gaps` array for each unsatisfied control.
4. Implement the remediation (enable a feature, adjust configuration, or add policies).
5. Regenerate the report to confirm the gap is resolved.
6. Document the remediation in your change management system.

### 6.3 Evidence Testing

To verify evidence generation before an audit:

1. Trigger a tool call that should generate evidence for each control.
2. Query the compliance report immediately after.
3. Verify that `evidence_count` increased and `status` is `satisfied`.

Example test for CC6.2 (Prior Authorization):

```bash
# 1. Trigger a tool call on a destructive plugin (routes to approval queue)
curl -X POST -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"plugin": "destructive-plugin", "tool": "delete_resource", "arguments": {}}' \
  https://app-proxy.example.com/tools/call

# 2. Approve the pending action
curl -X POST -H "X-Admin-Key: <admin-key>" \
  https://app-proxy.example.com/approval/<id>/approve

# 3. Verify evidence
curl -s -H "Authorization: Bearer <key>" \
  https://app-proxy.example.com/compliance/soc2/report | jq '.controls[] | select(.id == "CC6.2")'
```

---

## 7. Audit Preparation

### 7.1 What Auditors Will Ask

| Question | Where to Find the Answer |
|---|---|
| How are AI agent actions authorized? | Cedar policy engine (Section 2); policy files in `policies/cedar/` |
| What happens when an action is denied? | Audit logs with `policy_decision == deny`; approval queue records |
| How is sensitive data protected? | Argument masking (security.md Section 3.2); risk scoring patterns |
| Who can override the system? | Admin key holders; approval workflow; Cedar policy hot-reload |
| How are changes to policies tracked? | Git history of `policies/cedar/*.cedar`; policy reload logs |
| What detection capabilities exist? | Behavioral analyzer (5 patterns); risk scorer (6 factors) |
| How long are logs retained? | `APP_PROXY_RETENTION_DAYS` (configurable, default 30) |
| Can the system be stopped? | Yes: deny-all policy, plugin unload, approval denial (Art 14.4) |
| How is log integrity guaranteed? | SHA-256 hash chain on audit records |
| What frameworks are supported? | SOC 2, NIST AI RMF, EU AI Act (17 controls total) |

### 7.2 Evidence Artifacts to Prepare

1. **Compliance report** -- generate via API for each framework; export as JSON and PDF.
2. **Cedar policy files** -- export from version control with full Git history.
3. **Audit log sample** -- export a representative date range showing tool calls, policy decisions, and approvals.
4. **Configuration snapshot** -- document all `APP_PROXY_*` environment variables (redact secrets).
5. **Architecture diagram** -- show the proxy's position in the request flow (agent -> proxy -> policy engine -> plugin).
6. **Behavioral alert log** -- export any alerts from the reporting period.
7. **Approval workflow records** -- export approval queue history showing human reviewer identities.

### 7.3 Common Auditor Requests and Responses

**"Show me a denied action and what happened after."**

Query audit logs for `policy_decision == deny`, then show the behavioral alert (if any) and any subsequent approval request. The hash chain proves the log was not modified after the fact.

**"How do you ensure policies cannot be bypassed?"**

Cedar evaluation runs before every tool dispatch. The proxy has no "skip policy" code path. In `strict` mode, a deny decision results in HTTP 403 without calling the plugin. The policy engine is initialized at startup and the application refuses to start if no valid policies are found.

**"What happens if the policy engine fails?"**

If Cedar policy files are missing or invalid at startup, the application exits with an error. If a hot-reload encounters invalid policies, the previous valid policies are retained and an error is logged. There is no state where the engine operates without policies.

---

## 8. EU AI Act Article 14 -- Human Oversight

> **Enforcement date: August 2, 2026**

This section documents how the Tiresias App Proxy satisfies Article 14 of Regulation (EU) 2024/1689 (the EU AI Act), which requires human oversight for high-risk AI systems.

### 8.1 Applicability

The EU AI Act classifies AI systems into risk categories. If the Tiresias App Proxy governs agents that fall under Annex III high-risk categories (e.g., AI systems used in critical infrastructure, employment, law enforcement, or migration), Article 14 applies in full.

Even for non-high-risk deployments, implementing Article 14 controls is a best practice that demonstrates responsible AI governance.

### 8.2 Article 14(1) -- Effective Oversight During Use

**Requirement:** High-risk AI systems shall be designed and developed in such a way that they can be effectively overseen by natural persons during the period in which the AI system is in use.

**Implementation:**

- The approval queue intercepts all actions classified as destructive or high-risk before execution.
- Human reviewers see the full context: tool name, plugin, agent identity, risk score, risk factor breakdown, and behavioral alerts.
- The structured log stream provides real-time visibility into all agent actions.
- The `/health` endpoint and compliance API provide dashboards for continuous monitoring.

**Evidence:** Approval queue configuration (`APP_PROXY_ENABLE_APPROVAL_QUEUE=true`); approval records with timestamps and reviewer identity.

### 8.3 Article 14(2) -- Ability to Intervene or Interrupt

**Requirement:** Human oversight shall include the ability to intervene in the operation of the high-risk AI system or interrupt it through a "stop" button or a similar procedure.

**Implementation:**

| Intervention | Method | Latency |
|---|---|---|
| Deny a specific action | `POST /approval/{id}/deny` | Immediate |
| Disable a plugin | `POST /admin/plugins/{name}/unload` | Immediate |
| Halt all operations | Deploy deny-all Cedar policy | 0-30 seconds (immediate if forced via admin reload) |
| Pause scheduled actions | Scheduler pause API | Immediate |
| Rotate compromised credentials | Update `APP_PROXY_API_KEY_HASH`, restart | Seconds |

The deny-all Cedar policy acts as a system-wide "stop button":

```cedar
forbid (principal, action, resource);
```

This single rule overrides all permit policies. It can be deployed via filesystem write (picked up within 30 seconds) or forced via `POST /admin/policies/reload` for immediate effect.

### 8.4 Article 14(3) -- Correct Interpretation of Output

**Requirement:** Persons assigned to human oversight shall be enabled to correctly interpret the high-risk AI system's output.

**Implementation:**

- **Risk factor breakdown:** Every tool call response includes a list of risk factors with name, weight, value, and a human-readable explanation (e.g., "Tool is marked destructive/approval-required", "Arguments contain wildcard or broadcast indicators").
- **Policy reasons:** Cedar decisions include the specific policy IDs that contributed to the allow or deny decision.
- **Behavioral alerts:** Alerts include a `description` (e.g., "Agent read from 'list_files' then sent to 'send_email' within 45s") and a `recommendation` explaining what to investigate.
- **Audit log context:** Every record includes the full context needed to understand why an action was taken or blocked.

No decision is opaque. Human reviewers receive structured, actionable information for every action that requires oversight.

### 8.5 Article 14(4) -- Ability to Override or Reverse

**Requirement:** Persons shall be able to decide not to use the high-risk AI system or to otherwise disregard, override, or reverse its output.

**Implementation:**

- **Override:** Administrators can approve or deny any pending action, overriding the system's risk assessment.
- **Reverse:** Actions that have already executed are logged in the audit trail with full arguments, enabling manual reversal of their effects.
- **Disregard:** Administrators can switch to `advisory` mode (`APP_PROXY_POLICY_ENFORCEMENT_MODE=advisory`), which logs policy decisions but does not enforce them, effectively disregarding the system's recommendations.
- **Stop:** The deny-all policy and plugin unload capabilities allow complete cessation of AI-driven actions.

### 8.6 Compliance Checklist for Article 14

- [ ] Approval queue is enabled (`APP_PROXY_ENABLE_APPROVAL_QUEUE=true`)
- [ ] Destructive plugins are classified as `destructive` in their manifests
- [ ] At least one human operator has the admin key for intervention
- [ ] Deny-all policy template is prepared and tested
- [ ] Audit log retention meets regulatory requirements
- [ ] Human reviewers have access to the approval API (or dashboard)
- [ ] Risk factor breakdowns are displayed to reviewers before approval decisions
- [ ] Incident response procedure documents the "stop button" (deny-all policy)
- [ ] Compliance reports are generated and archived monthly

---

## 9. Continuous Compliance Monitoring

### 9.1 Automated Checks

Schedule periodic compliance report generation:

```bash
# Daily SOC 2 report
0 6 * * * curl -s -H "Authorization: Bearer <key>" \
  https://app-proxy.example.com/compliance/soc2/report \
  > /var/log/compliance/soc2_$(date +\%Y\%m\%d).json

# Weekly NIST AI RMF report
0 6 * * 1 curl -s -H "Authorization: Bearer <key>" \
  https://app-proxy.example.com/compliance/nist_ai_rmf/report \
  > /var/log/compliance/nist_$(date +\%Y\%m\%d).json

# Monthly EU AI Act report
0 6 1 * * curl -s -H "Authorization: Bearer <key>" \
  https://app-proxy.example.com/compliance/eu_ai_act/report \
  > /var/log/compliance/eu_ai_act_$(date +\%Y\%m\%d).json
```

### 9.2 Alerting on Compliance Drift

Monitor compliance reports for status changes:

```bash
# Alert if any control is unsatisfied
STATUS=$(curl -s -H "Authorization: Bearer <key>" \
  https://app-proxy.example.com/compliance/soc2/report | \
  jq -r '.overall_status')

if [ "$STATUS" != "satisfied" ]; then
  # Send alert to compliance team
  echo "SOC 2 compliance drift detected: $STATUS"
fi
```

### 9.3 Evidence Retention

Compliance reports are point-in-time snapshots. Archive them to immutable storage (S3 with object lock, Azure Blob with immutability policy, or on-prem WORM storage) for the duration of your audit period plus any required retention.

### 9.4 Control Testing Schedule

| Control Area | Test Frequency | Method |
|---|---|---|
| Policy enforcement (CC6.1) | Continuous | Verify `policy_decision` on every audit record |
| Approval workflow (CC6.2) | Weekly | Submit test action, approve, verify record |
| Behavioral detection (CC7.2) | Monthly | Simulate threat patterns, verify alerts |
| Policy change management (CC8.1) | Per change | Review Git diff, verify validation log |
| Human oversight (Art 14) | Monthly | Test deny-all policy deployment, verify halt |
| Risk assessment (MAP 1.5) | Continuous | Monitor risk score distributions |
