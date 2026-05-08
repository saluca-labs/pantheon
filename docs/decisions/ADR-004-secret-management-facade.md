# ADR-004: Secret Management Facade

> Status: accepted (May 2026, platform/unification-v3)

## Context

Until v3, every Python service in the @platform stack read secrets
directly from process env vars. That works fine in dev but produces
brittle, inconsistent practices in production:

* Some services hard-code `os.environ.get(...)`; others use
  `pydantic-settings`; a few build ad-hoc Vault clients inline.
* Rotating a secret requires a redeploy because the value is baked
  into the env at container start.
* No common interface to plug in AWS Secrets Manager, GCP Secret
  Manager, or HashiCorp Vault — each adoption is a one-off PR.
* Audit trails live in N different places.

The platform-app-proxy and worker introduced in v3 both need access
to SMTP creds and database URLs that ops would prefer to manage
through Vault, not raw env variables.

## Decision

Introduce `packages/secrets/python/platform_secrets/` — a small,
zero-dep facade that:

1. Defines a `SecretsBackend` Protocol (single `get(path, *, no_cache)`
   method) that all providers implement.
2. Ships built-in backends for `env://` and `file://` (no extra deps).
3. Ships lazy-loaded backends for `vault://`, `awssm://`, `gcpsm://`
   that only import their cloud SDK on first use, behind extras
   (`platform-secrets[vault]`, `[aws]`, `[gcp]`).
4. Exposes a `resolve(value)` function that routes references to the
   right backend, returning literals unchanged.
5. Wires into `platform_config.get_settings()` so a deployment can put
   `DATABASE_URL=vault://secret/data/platform/db#url` in its env and
   the rest of the codebase keeps reading a plain Postgres URL.

## Reference syntax

```
<scheme>://<provider-specific-path>[#<optional-field>]
```

| Scheme    | Provider                 | Path shape                                  |
|-----------|--------------------------|---------------------------------------------|
| `env`     | Process environment      | `VAR_NAME`                                  |
| `file`    | File mount               | `/etc/secrets/x` or `relative/path`         |
| `vault`   | Vault KV-v2              | `<mount>/data/<path>#<field>`               |
| `awssm`   | AWS Secrets Manager      | `<arn-or-name>[#<json-field>]`              |
| `gcpsm`   | GCP Secret Manager       | `projects/<p>/secrets/<n>/versions/<v>`     |

`postgres://...`, `redis://...`, and other unknown schemes are left as
literals — the loader only resolves values whose scheme is registered.
This prevents accidentally routing `DATABASE_URL=postgres://...` to a
non-existent backend.

## Caching

Each cloud-backed backend keeps an in-memory TTL cache keyed by the
reference string. Defaults: 30s for Vault (faster rotation), 60s for
AWS/GCP. Callers can pass `no_cache=True` to bypass. The intent is to
balance "secrets that just rotated" against "DDoS the secret store"
during a hot loop.

## What this ADR does NOT do

* **Does not change any service today.** Existing `os.environ.get()`
  call sites keep working. Adoption is opt-in: change a single env
  var to a reference, no code change required.
* **Does not pre-authenticate clients in tests.** Tests use a stub
  backend; production deploys are expected to set `VAULT_TOKEN`,
  `AWS_REGION`, etc. via the existing infra (sidecar, IRSA, workload
  identity).
* **Does not implement secret writing.** This is a read-side facade
  only — secrets are still authored via the provider's own tooling.

## Alternatives considered

* **Just use `pydantic-settings` SecretStr** — solves the type-safety
  half but not the rotation/multi-backend half.
* **Adopt a single provider** (Vault only) — locks the platform out of
  AWS-only and GCP-only deploys, where IAM-managed secret stores are
  cheaper and integrate with the cloud's own audit trail.
* **Use the `python-secrets` PyPI package** — that name belongs to a
  random unmaintained 2017 module; not a viable foundation.

## Consequences

* New v3 services (worker, sovereign main) can declare
  `DATABASE_URL=vault://...` and have it just work.
* Future hardening — secret expiry alerts, rotation hooks, audit
  forwarders — can layer on the same backend Protocol without changing
  call sites.
* Operators get a single page (`README`) describing how to wire any of
  the supported providers.
