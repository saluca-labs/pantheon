# Tiresias App Proxy -- Cedar Policy Authoring Guide

**Version:** 0.1.0
**Last updated:** 2026-04-05
**Audience:** Security engineers, platform operators, policy authors

---

## Table of Contents

1. [What Is Cedar](#1-what-is-cedar)
2. [Entity Schema](#2-entity-schema)
3. [Writing Policies](#3-writing-policies)
4. [Common Patterns](#4-common-patterns)
5. [Testing Policies](#5-testing-policies)
6. [Hot-Reload Behavior](#6-hot-reload-behavior)
7. [Advanced Topics](#7-advanced-topics)

---

## 1. What Is Cedar

Cedar is an open-source authorization policy language created by Amazon. It uses a declarative syntax to express access control rules that are evaluated against a typed entity model.

Key properties relevant to Tiresias:

- **Deterministic evaluation** -- the same request always produces the same decision.
- **Deny overrides permit** -- a single `forbid` rule blocks an action even if multiple `permit` rules allow it.
- **Formally verifiable** -- Cedar policies can be analyzed for conflicts and completeness.
- **Fast evaluation** -- policy decisions are computed in microseconds.

Official documentation: [https://www.cedarpolicy.com/](https://www.cedarpolicy.com/)

The Tiresias App Proxy uses `cedarpy` (Python bindings, version 4.8+) to evaluate policies. The engine is implemented in `src/app_proxy/policy/engine.py`.

---

## 2. Entity Schema

The Cedar schema (`src/app_proxy/policy/schema.json`) defines three entity types and three actions.

### 2.1 Entity Types

#### Tiresias::Tenant

Represents an organizational tenant. All agents belong to exactly one tenant.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `tier` | String | Yes | Subscription tier (`free`, `pro`, `enterprise`) |
| `max_agents` | Long | Yes | Maximum number of agents allowed for this tenant |

#### Tiresias::Agent

Represents an AI agent making tool calls through the proxy. Agents are members of a Tenant.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `soulkey` | String | Yes | Cryptographic identity key for the agent |
| `roles` | Set of String | Yes | Roles assigned to the agent (e.g., `["reader", "writer"]`) |

**Hierarchy:** `Tiresias::Agent` is `memberOfTypes: ["Tenant"]`. An agent's parent tenant is included in the entity slice during evaluation.

#### Tiresias::Plugin

Represents an MCP plugin that the agent is invoking.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `classification` | String | Yes | Risk classification: `safe`, `sensitive`, or `destructive` |
| `owner_tenant` | String | Yes | Tenant ID that owns/registered this plugin |

### 2.2 Actions

#### Tiresias::Action::"tool_call"

Primary action for tool invocations. Context fields:

| Field | Type | Description |
|---|---|---|
| `tool_name` | String | Name of the specific tool being invoked |
| `rate_count` | Long | Number of calls by this agent in the current rate window |
| `rate_window_seconds` | Long | Duration of the rate window in seconds |
| `hour_of_day` | Long | Current UTC hour (0-23) |
| `has_approval` | Boolean | Whether this action has been approved by a human |
| `estimated_cost_usd` | Long | Estimated cost in USD cents |
| `input_keys` | Set of String | Keys of the input arguments |

#### Tiresias::Action::"read"

Read-only operations. Context fields:

| Field | Type | Description |
|---|---|---|
| `tool_name` | String | Name of the tool |
| `hour_of_day` | Long | Current UTC hour (0-23) |

#### Tiresias::Action::"write"

Write/mutate operations. Context fields:

| Field | Type | Description |
|---|---|---|
| `tool_name` | String | Name of the tool |
| `hour_of_day` | Long | Current UTC hour (0-23) |
| `has_approval` | Boolean | Whether this action has been approved |
| `rate_count` | Long | Number of calls in the current rate window |

---

## 3. Writing Policies

### 3.1 File Location

Place `.cedar` files in the policies directory (default: `policies/cedar/`). All `.cedar` files in this directory (and subdirectories) are loaded and concatenated at startup and on each reload cycle.

Recommended file organization:

```
policies/cedar/
  base.cedar          # Default permit/forbid rules
  tenant_overrides.cedar   # Per-tenant customizations
  emergency.cedar     # Incident response rules (initially empty)
```

### 3.2 Permit Rules

A `permit` rule allows an action when its conditions are met:

```cedar
permit (
    principal,
    action == Tiresias::Action::"read",
    resource
);
```

This permits any agent to perform read actions on any plugin. The `principal`, `action`, and `resource` clauses filter which requests the rule applies to.

### 3.3 Forbid Rules

A `forbid` rule denies an action. Forbid always overrides permit:

```cedar
forbid (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    resource.classification == "destructive" &&
    !context.has_approval
};
```

This forbids write actions on destructive plugins unless the action has been approved.

### 3.4 The `when` Clause

Conditions in the `when` clause reference:

- **`principal`** attributes: `principal.soulkey`, `principal.roles`
- **`resource`** attributes: `resource.classification`, `resource.owner_tenant`
- **`context`** fields: `context.tool_name`, `context.hour_of_day`, `context.rate_count`, `context.has_approval`

Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, `.contains()`

### 3.5 The `unless` Clause

The `unless` clause is the inverse of `when`. The rule applies unless the condition is true:

```cedar
permit (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) unless {
    context.rate_count >= 100
};
```

---

## 4. Common Patterns

### 4.1 Allow All Reads

```cedar
// Any agent can read from any plugin, any time
permit (
    principal,
    action == Tiresias::Action::"read",
    resource
);
```

### 4.2 Deny Destructive Actions Without Approval

```cedar
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    resource.classification == "destructive" &&
    !context.has_approval
};
```

### 4.3 Rate Limiting

```cedar
// Forbid tool calls when rate limit exceeded
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.rate_count >= 100
};
```

To set different limits per plugin classification:

```cedar
// Stricter rate limit for destructive plugins
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    resource.classification == "destructive" &&
    context.rate_count >= 10
};
```

### 4.4 Business Hours Restriction

```cedar
// Permit writes only during business hours (06:00-22:00 UTC)
permit (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    context.hour_of_day >= 6 &&
    context.hour_of_day <= 22
};

// Explicit deny outside business hours
forbid (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    context.hour_of_day < 6 ||
    context.hour_of_day > 22
};
```

### 4.5 Restrict by Agent Role

```cedar
// Only agents with the "admin" role can call admin tools
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.tool_name == "update_config" &&
    !principal.roles.contains("admin")
};
```

### 4.6 Restrict by Tenant Tier

```cedar
// Free-tier tenants cannot use destructive plugins
forbid (
    principal in Tiresias::Tenant::"<tenant-id>",
    action == Tiresias::Action::"tool_call",
    resource
) when {
    resource.classification == "destructive"
};
```

### 4.7 Cost Threshold

```cedar
// Require approval for actions estimated above $10
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.estimated_cost_usd > 1000 &&
    !context.has_approval
};
```

Note: `estimated_cost_usd` is in cents, so 1000 = $10.00.

### 4.8 Specific Tool Restriction

```cedar
// Forbid the "delete_channel" tool entirely
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.tool_name == "delete_channel"
};
```

### 4.9 Emergency Deny-All

```cedar
// EMERGENCY: deny all actions
forbid (
    principal,
    action,
    resource
);
```

Deploy this file to halt all operations. Remove it and wait for reload (or force reload) to resume.

---

## 5. Testing Policies

### 5.1 Validate Policies

Before deploying, validate policies against the schema:

```bash
curl -X POST \
  -H "X-Admin-Key: <admin-key>" \
  https://app-proxy.example.com/admin/policies/validate
```

Response:

```json
{
  "valid": true,
  "errors": []
}
```

If validation fails:

```json
{
  "valid": false,
  "errors": [
    "Syntax error on line 5: unexpected token 'whenn'"
  ]
}
```

### 5.2 Force Reload

After editing policy files on disk (or updating a ConfigMap), force an immediate reload:

```bash
curl -X POST \
  -H "X-Admin-Key: <admin-key>" \
  https://app-proxy.example.com/admin/policies/reload
```

Response:

```json
{
  "status": "ok"
}
```

### 5.3 Testing Workflow

1. Edit policy files in a development environment.
2. Run `POST /admin/policies/validate` to check syntax and schema conformance.
3. Trigger test tool calls that should be allowed and denied.
4. Check audit logs and structlog output for `cedar_engine.authorize` events.
5. Verify `allowed` and `reasons` fields match expectations.
6. Deploy to production via image rebuild or ConfigMap update.

### 5.4 Policy Evaluation Logging

Every authorization decision is logged:

```json
{
  "event": "cedar_engine.authorize",
  "agent_id": "alfred-minipc",
  "tenant_id": "a1b2c3d4-...",
  "plugin_id": "slack",
  "action": "tool_call",
  "allowed": true,
  "needs_approval": false,
  "reason_count": 1,
  "error_count": 0
}
```

Use these logs to verify that policies are evaluated as expected.

---

## 6. Hot-Reload Behavior

### 6.1 Reload Cycle

The policy engine checks for changes every 30 seconds (configurable via `CEDAR_RELOAD_INTERVAL_SECONDS`):

1. The engine reads all `.cedar` files from `policies_dir` (sorted alphabetically).
2. Files are concatenated into a single policy string.
3. A validation dry-run authorization is executed against the schema.
4. If validation passes, the new policies replace the current set under a thread lock.
5. If validation fails, the previous valid policies are retained and an error is logged.

### 6.2 Atomicity

Policy replacement is atomic at the thread-lock level. During the switch, in-flight evaluations complete against the old policies. New evaluations immediately use the new policies. There is no window where no policies are active.

### 6.3 Failure Handling

| Scenario | Behavior |
|---|---|
| New policies are syntactically valid | Old policies replaced atomically |
| New policies fail schema validation | Old policies retained; error logged as `cedar_engine.load_policies.validation_failed` |
| Policy files deleted (directory empty) | Old policies retained; `FileNotFoundError` logged |
| First startup with invalid policies | Application refuses to start (exception propagates) |

### 6.4 Forcing Immediate Reload

The 30-second poll interval is a maximum. To reload immediately:

```bash
curl -X POST -H "X-Admin-Key: <admin-key>" \
  https://app-proxy.example.com/admin/policies/reload
```

---

## 7. Advanced Topics

### 7.1 Using risk_score in Context

While `risk_score` is not in the current Cedar schema context, you can extend the schema to include it. Once added, policies can reference it:

```cedar
// Deny actions with critical risk score
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.risk_score >= 76
};
```

To add `risk_score` to the schema, edit `schema.json` and add to the `tool_call` action context:

```json
"risk_score": { "type": "Long", "required": true }
```

### 7.2 Custom Entity Attributes

Extend the entity schema to add organization-specific attributes:

**Example: Add `department` to Agent:**

1. Edit `schema.json`:
   ```json
   "Agent": {
     "shape": {
       "type": "Record",
       "attributes": {
         "soulkey": { "type": "String", "required": true },
         "roles": { "type": "Set", "element": { "type": "String" }, "required": true },
         "department": { "type": "String", "required": true }
       }
     }
   }
   ```

2. Ensure the entity slice builder passes the `department` attribute in `agent_attrs`.

3. Write policies using the new attribute:
   ```cedar
   // Only finance department agents can access billing plugins
   forbid (
       principal,
       action == Tiresias::Action::"tool_call",
       resource
   ) when {
       resource.owner_tenant == "billing" &&
       principal.department != "finance"
   };
   ```

### 7.3 Multi-File Policy Organization

Policies are loaded from all `.cedar` files alphabetically. Use numeric prefixes to control evaluation order (though Cedar evaluation is order-independent -- this is for human readability):

```
policies/cedar/
  00_base.cedar           # Core permit/forbid rules
  10_rate_limits.cedar    # Rate limiting rules
  20_business_hours.cedar # Time-based restrictions
  30_tenant_rules.cedar   # Per-tenant overrides
  90_emergency.cedar      # Emergency rules (empty by default)
```

### 7.4 Policy Versioning Strategy

Since Cedar files are stored on the filesystem and loaded at runtime:

1. Store policies in Git alongside the application code.
2. Tag policy changes with the release version.
3. Use ConfigMaps in Kubernetes to deploy policy changes without rebuilding the image.
4. Keep an `emergency.cedar` file that is empty by default. During incidents, write deny rules to this file for immediate effect.

### 7.5 Debugging Policy Decisions

When a policy decision is unexpected:

1. Check the `cedar_engine.authorize` log for the decision and reason count.
2. If `reason_count > 0`, the decision was driven by specific named policies (Cedar does not expose policy IDs by default in cedarpy, but `diagnostics.reasons` provides context).
3. If `error_count > 0`, check `diagnostics.errors` for schema mismatches or type errors.
4. Simplify the request to isolate which policy is triggering. Test with a minimal policy set.
5. Use `POST /admin/policies/validate` to verify the on-disk policies are syntactically correct.
