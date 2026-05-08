# platform-secrets

Production secret-management facade for the @platform stack.

## What it does

Provides a uniform interface for resolving secret references against
multiple backends:

| Scheme    | Backend                    | Optional dep                      |
| --------- | -------------------------- | --------------------------------- |
| `env://`  | Process environment        | _(none — built in)_               |
| `file://` | Mounted file (k8s/swarm)   | _(none — built in)_               |
| `vault://`| HashiCorp Vault (KV-v2)    | `pip install platform-secrets[vault]` |
| `awssm://`| AWS Secrets Manager        | `pip install platform-secrets[aws]`   |
| `gcpsm://`| GCP Secret Manager         | `pip install platform-secrets[gcp]`   |

All cloud SDKs are loaded lazily on first use. Apps that only need the
default env-var resolution incur zero extra install footprint.

## Reference syntax

```
env://VAR_NAME
file:///etc/secrets/db_url                 # absolute path
file://relative/path                       # cwd-relative

vault://<mount>/data/<path>#<field>        # KV-v2; field optional if 1 key
awssm://<arn-or-name>[#<json-field>]       # JSON field optional
gcpsm://projects/<id>/secrets/<n>/versions/<v>
```

## Usage

```python
from platform_secrets import resolve, configure
from platform_secrets.backends import VaultBackend

# Default: env-var lookup, then literal pass-through
resolve("DATABASE_URL")             # → reads DATABASE_URL env or returns 'DATABASE_URL'

# Reference syntax: backend prefix selects provider
resolve("vault://secret/data/platform/db#password")

# Configure a pre-authenticated client at process start
configure(VaultBackend(addr="https://vault.internal:8200", token=my_token))
```

## Integration with `platform_config`

When `platform_secrets` is installed alongside `platform_config`, the
`get_settings()` loader transparently resolves any of the following env
vars when their value uses a known scheme prefix:

```
DATABASE_URL  SESSION_SECRET  SMTP_HOST  SMTP_FROM  REDIS_URL  COOKIE_DOMAIN
```

Plain literals (`postgres://...`, `redis://...`) are not touched —
the resolver only triggers on schemes registered with the facade.

## Threading

The module-level singleton facade is threadsafe. Each backend acquires
its underlying client behind a per-instance lock and TTL-caches read
results. Clients are reused across threads.

## Why a facade and not just env vars

* Centralises auditing — there's one path through which production
  secrets flow.
* Lets apps mix backends: e.g. session secret from Vault, database URL
  from AWS Secrets Manager, SMTP creds from a k8s mounted file.
* Cloud SDK imports stay optional, so dev/test images don't bloat.
* Consistent caching/TTL semantics across providers.

## Testing

```bash
cd packages/secrets/python
python -m pytest -q
```
