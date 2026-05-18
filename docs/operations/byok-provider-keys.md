# BYOK Provider Keys

Pantheon's Wave-H agent platform supports **per-tenant** Bring Your
Own Key (BYOK) for upstream LLM providers. Each tenant configures its
own provider credentials; Pantheon stores only a secret-ref URI
(never the resolved value) and resolves the secret at call time.

This guide covers operator setup. For the user-level "where do I
click in the portal" view, see the dashboard at
`http://localhost:3000/dashboard/settings` (Provider Keys pane). For
the integration into `agent.yaml` imports, see
[`agents-platform-quickstart.md`](agents-platform-quickstart.md).

## Supported providers

Pantheon ships with probe targets for five providers. Anything else
is rejected at write time with HTTP 400.

| Provider | Probe endpoint | Auth style | Default `base_url` |
|---|---|---|---|
| `anthropic` | `/v1/models` | `x-api-key` + `anthropic-version: 2023-06-01` | `https://api.anthropic.com` |
| `openai` | `/v1/models` | `Authorization: Bearer …` | `https://api.openai.com` |
| `gemini` | `/v1beta/models` | `?key=…` query param | `https://generativelanguage.googleapis.com` |
| `groq` | `/openai/v1/models` | `Authorization: Bearer …` | `https://api.groq.com` |
| `ollama` | `/api/tags` | unauthenticated | `http://localhost:11434` |

`base_url` is optional and accepts a full URL override — useful for
Azure OpenAI deployments, alternate Ollama hosts, or proxies. When
unset, the default above is used.

## Secret-ref URI schemes

Pantheon recognizes five URI schemes for `secret_ref`. All five resolve
through the `platform_secrets` facade in `packages/secrets/python/`.

| Scheme | Resolves to | Backend deps |
|---|---|---|
| `env://VAR_NAME` | `os.environ["VAR_NAME"]` inside the platform-api container | none |
| `file:///path` | File contents (Docker/k8s mounted secrets) | none |
| `vault://<mount>/data/<path>#<field>` | HashiCorp Vault KV-v2 | `hvac` (install via `platform-secrets[vault]`); requires `VAULT_ADDR` + `VAULT_TOKEN` (and optionally `VAULT_NAMESPACE`) on the platform-api container |
| `gcpsm://projects/<id>/secrets/<name>/versions/<v>` | GCP Secret Manager | `google-cloud-secret-manager` (install via `platform-secrets[gcp]`); requires `GOOGLE_APPLICATION_CREDENTIALS` or ambient ADC |
| `awssm://<arn-or-name>[#<json-field>]` | AWS Secrets Manager | `boto3` (install via `platform-secrets[aws]`); requires `AWS_REGION` + standard AWS credential discovery |

A write fails with a structured 400 only when the URI is malformed or
uses a scheme the facade doesn't know about (e.g. `ftp://`). Supported
scheme but currently unresolvable (env var not set, vault path empty,
backend unreachable) is **accepted** — Pantheon assumes you'll populate
the secret later, and you can verify with the `/test` endpoint.

For backend setup details (credential discovery, caching, error
classes), see [`packages/secrets/python/README.md`](../../packages/secrets/python/README.md).

## Setting it up

### Step 1 — Make the secret available to platform-api

The `env://` scheme reads from the platform-api container's
environment. For docker compose:

```yaml
# docker-compose.override.yml (gitignored)
services:
  platform-api:
    environment:
      TENANT_ANTHROPIC_KEY: ${TENANT_ANTHROPIC_KEY}
      TENANT_OPENAI_KEY: ${TENANT_OPENAI_KEY}
```

```bash
# .env (loaded by docker compose, gitignored)
TENANT_ANTHROPIC_KEY=sk-ant-…
TENANT_OPENAI_KEY=sk-…
```

Restart platform-api so it picks up the new env:

```bash
docker compose up -d platform-api
```

### Step 2 — Register the provider key

Via curl:

```bash
export PANTHEON=http://localhost:8000
export SOULKEY="sk_agent_…"

curl -X POST "$PANTHEON/v1/provider-keys" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "secret_ref": "env://TENANT_ANTHROPIC_KEY",
    "status": "active"
  }'
```

Response:

```json
{
  "id": "…",
  "tenant_id": "…",
  "provider": "anthropic",
  "secret_ref": "env://TENANT_ANTHROPIC_KEY",
  "base_url": null,
  "status": "active",
  "metadata": {},
  "created_at": "…",
  "updated_at": "…",
  "created_by": null
}
```

The `secret_ref` field is the URI ref, not the resolved value — the
resolved value is **never** part of any wire response.

Via the portal: Settings → Provider Keys → Add Override → fill the
form. The portal hits the same endpoint; the modal also exposes
`POST /v1/provider-keys/test` to verify the key works before saving.

### Step 3 — Verify

```bash
# Resolve + probe (cheap call; no quota burn)
curl -X POST "$PANTHEON/v1/provider-keys/<key-id>/test" \
  -H "X-SoulKey: $SOULKEY"
```

```json
{
  "ok": true,
  "latency_ms": 412,
  "error": null,
  "secret_ref_info": {"scheme": "env", "target": "TENANT_ANTHROPIC_KEY", "valid": true}
}
```

If `ok: false`, the `error` field gives a short diagnostic (auth
rejected, timeout, etc.). See the
[TROUBLESHOOTING table](../../apps/platform-api/deploy/TROUBLESHOOTING.md#provider-key-resolution-failures).

### Step 4 — Override per agent (optional)

Most tenants set one key per provider and let all of their agents
share it. If a specific agent needs a different key, declare it inside
the agent's `agent.yaml`:

```yaml
metadata:
  persona: cost-sensitive-research
  name: Research (Groq variant)

spec:
  prompt:
    name: research-prompt
    body: "…"

  provider_overrides:
    - provider: groq
      secret_ref: env://TENANT_GROQ_KEY
      status: active
```

`provider_overrides` upserts the row by `(tenant_id, provider)`, so
multiple agents in the same tenant referring to the same provider
share one row. The override is per-tenant, not per-agent — Pantheon
deliberately does not model per-persona keys, since that would multiply
the secret surface area without serving most real-world use cases.

## Endpoint reference

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/v1/provider-keys` | `providers:read` | List; `?provider=anthropic` to filter |
| GET | `/v1/provider-keys/{id}` | `providers:read` | Cross-tenant → 404 |
| POST | `/v1/provider-keys` | `providers:write` | Upsert by `(tenant, provider)` |
| PATCH | `/v1/provider-keys/{id}` | `providers:write` | Update `secret_ref`, `base_url`, `status`, `metadata` |
| DELETE | `/v1/provider-keys/{id}` | `providers:write` | Hard delete |
| POST | `/v1/provider-keys/{id}/test` | `providers:read` | Resolve + probe upstream |
| POST | `/v1/provider-keys/test` | `providers:read` | Test an inline `{provider, secret_ref, base_url}` without saving |

## What's NEVER in a response

The resolved secret value never appears in:

- Any HTTP response body (including `/test` responses — only `ok` /
  `error` / `latency_ms` are returned, plus a non-secret
  `secret_ref_info` description of the scheme + target).
- The structured logs (`platform-api` logs `provider_keys.upsert`
  with `secret_ref` masked to scheme + target).
- The audit log (`_audit_logs` only records the operation type and
  the key id, never the value).

If you find a code path where a resolved key leaks, that's a
security bug — file via [SECURITY.md](../../apps/platform-api/SECURITY.md).

## Disabling a key without deleting it

```bash
curl -X PATCH "$PANTHEON/v1/provider-keys/<key-id>" \
  -H "X-SoulKey: $SOULKEY" -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

Disabled keys remain in the table but are skipped at lookup time. Use
this for temporary disablement (incident response, rotation
preparation) rather than deleting and re-creating.

## Rotation

There's no dedicated rotation endpoint — rotation is just a PATCH:

1. Add the new secret env var to the platform-api container env
   (e.g. `TENANT_ANTHROPIC_KEY_V2`).
2. `docker compose up -d platform-api`.
3. `PATCH /v1/provider-keys/<key-id> {"secret_ref": "env://TENANT_ANTHROPIC_KEY_V2"}`.
4. Run `/test` to verify.
5. Remove the old env var on the next deploy cycle.

For `vault://`, `gcpsm://`, and `awssm://`, rotation is a no-op as far
as Pantheon is concerned — the upstream secret store handles
versioning, and the cached resolution refreshes on its next TTL
(default 30s). For `env://` rotation, the swap-and-PATCH flow above
is the supported path.

## See also

- [`agents-platform-quickstart.md`](agents-platform-quickstart.md)
  — operator walkthrough that uses provider keys
- [`apps/platform-api/src/agents/agent_yaml_schema.md`](../../apps/platform-api/src/agents/agent_yaml_schema.md)
  — `spec.provider_overrides` field reference
- [`apps/platform-api/deploy/TROUBLESHOOTING.md`](../../apps/platform-api/deploy/TROUBLESHOOTING.md#provider-key-resolution-failures)
  — failure modes
- [`packages/secrets/python/README.md`](../../packages/secrets/python/README.md)
  — the underlying `platform_secrets` facade
