# End-to-End Smoke Matrix

> Status: stable as of platform/oasis-rollout (May 2026)

Every PR runs a 24-check CI matrix. Ten of those checks are end-to-end
smoke jobs that boot the full default compose profile, apply the
local-auth migration tree, and exercise each Agentic OS through a real
HTTP round-trip. This page documents what each smoke job does, what
counts as success, and how to debug a failure.

## CI shape

```
14 base checks                     10 smoke checks (this doc)
─────────────                       ────────────────────────────
lint                                End-to-end smoke (all)
typecheck                           End-to-end smoke (health)
test                                End-to-end smoke (maker)
alembic upgrade (dual tree)         End-to-end smoke (research)
build × {web, api}                  End-to-end smoke (secure-dev)
docker × {web, api}                 End-to-end smoke (cyber)
                                    End-to-end smoke (filmmaker)
                                    End-to-end smoke (autobiographer)
                                    End-to-end smoke (business)
                                    End-to-end smoke (creator)

Total: 24 required green checks per PR.
```

The base checks live in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
The smoke jobs run a Python harness:
[`scripts/smoke-test.py`](../../scripts/smoke-test.py).

## What every smoke job does

Each matrix value (`os_slug`) runs the same workflow:

1. Bring up the `default` compose profile (db, mailhog, platform-api,
   platform-web, memory-service)
2. Wait for `/api/health/live` on platform-web (up to 5 minutes)
3. Apply the local-auth migration tree (`packages/database`) against
   the live database — this also creates every `agos_*` table
4. Run `python scripts/smoke-test.py --os <slug> --write`
5. Capture compose logs on failure
6. Tear down

The harness exits non-zero on any `fail()`, which fails the job.

## Step sequence inside the harness

```
register     → POST /api/auth/register (new test user, fresh email per run)
login        → POST /api/auth/login
health-full  → GET /api/health/full (sanity)
bff-identity → GET /api/tiresias/auth/me
bff-auth     → GET /api/tiresias/auth/mode

(per slug in matrix)
  agos.<slug>.read   → GET probe defined in AGENTIC_OS_PROBES
  agos.<slug>.write  → POST/PUT probe (8 of 9 OSes; filmmaker is read-only)

audit.view             → GET /api/.../audit?limit=50
agos.summary           → GET /api/.../summary    (only if at least one slug ran)
agos.flags.roundtrip   → GET, PUT toggle, GET, PUT restore on /flags
memory.crud            → GET/POST/PATCH/DELETE on memory-service
```

The cross-OS endpoints (`audit`, `summary`, `flags`) are exercised on
**every** matrix job, regardless of `os_slug`. That's deliberate: a
per-slug job that ran with no writes still proves the cross-OS endpoints
respond, just with empty / read-only payloads.

## Per-slug variations

`os_slug` controls which per-OS probes run inside the harness loop.

| Matrix value | Slugs probed | Write probe? |
| ------------ | ------------ | ------------ |
| `all`        | All 9        | 8 yes, filmmaker no |
| `health`     | health       | yes |
| `maker`      | maker        | yes |
| `research`   | research     | yes |
| `secure-dev` | secure-dev   | yes |
| `cyber`      | cyber        | yes |
| `filmmaker`  | filmmaker    | **no** (read-only) |
| `autobiographer` | autobiographer | yes |
| `business`   | business     | yes |
| `creator`    | creator      | yes |

### Why filmmaker is read-only

The filmmaker write probe would need a real `projectId`. Creating a
project plus a shot in the same probe is a more complex flow than the
others, and it duplicates what `--os all` already exercises end-to-end.
Marking filmmaker read-only in the per-slug matrix keeps the smoke
budget linear.

This is what required the `step_audit_view(expect_nonempty=...)`
parameter — see "audit.view tolerance" below.

## Audit and flags round-trips

### `audit.view`

```
GET /api/tiresias/agentic-os/audit?limit=50
```

Success criteria:

- `200 OK` with a JSON body containing an `entries` array, **or**
- `404 Not Found` (skipped, with a "endpoint not yet deployed" note).
  This is the staged-rollout safety net — older deploys that pre-date
  ADR-006 keep passing.

When at least one write probe ran in this job (`wrote_anything = true`),
`entries` must be non-empty. When no write probe ran (e.g. per-slug
`filmmaker` job), an empty `entries` is accepted with a "no write probes
ran" success note.

### `agos.summary`

```
GET /api/tiresias/agentic-os/summary
```

Success criteria:

- `200 OK` with a `summary` map containing every registered slug, **or**
- `404 Not Found` (skipped).

Only invoked when at least one slug was probed in the matrix job.

### `agos.flags.roundtrip`

```
GET /api/tiresias/agentic-os/flags                       → flags map
PUT /api/tiresias/agentic-os/flags  {slug, enabled:false} → ok
GET /api/tiresias/agentic-os/flags                       → slug now false
PUT /api/tiresias/agentic-os/flags  {slug, enabled:true}  → ok
GET /api/tiresias/agentic-os/flags                       → slug back to true
```

Success criteria: full round-trip succeeds, **or** any GET/PUT returns
404 (skipped, with note). The 404 short-circuit lets the matrix continue
passing on deploys that pre-date ADR-007.

## Debugging a smoke failure

### 1. Read the harness output

The harness prefixes each step with `✓ ` (pass) or `✗ ` (fail). The
first `✗` is what failed the job; the rest of the steps after it did
not run. Copy the failing step name (e.g. `agos.maker.write`) and
search the harness for that string to find the exact assertion.

### 2. Inspect compose logs

The job's "Capture logs on failure" step prints the last 200 lines from
`platform-api`, `platform-web`, `memory-service`, and `db`. Common
signatures:

| Signature                                    | Likely cause |
| -------------------------------------------- | ------------ |
| `relation "agos_<X>" does not exist`         | Migration didn't run before harness; usually a new migration not chained correctly |
| `409 Conflict` on register                   | Email collision — the harness should generate per-run emails, but a recent change may have hardcoded one |
| `500` on a per-OS write                      | Look at the platform-web BFF logs and the corresponding `repo.ts` |
| `audit.view → entries list is empty`         | A write probe didn't actually write — usually a 4xx the harness logged but didn't escalate |
| `flags.toggle → 404`                         | ADR-007 PUT route missing — re-check Workstream E merged |

### 3. Reproduce locally

The smoke harness is a normal Python script:

```bash
docker compose --profile default up -d --build
cd packages/database && alembic upgrade heads
PLATFORM_WEB_URL=http://localhost:3000 \
TIRESIAS_API_URL=http://localhost:8000 \
MEMORY_SERVICE_URL=http://localhost:8910 \
MEMORY_SERVICE_KEY=changeme-memory-service-shared-secret \
python scripts/smoke-test.py --os <slug> --write
```

Drop `--write` to run read-only.

## Adding a smoke probe for a new OS

When a new OS lands, add it to `AGENTIC_OS_PROBES` in
`scripts/smoke-test.py`:

```python
"<slug>": {
    "path":   "/api/tiresias/agentic-os/<slug>/<entity>",
    "params": {"projectId": "..."},  # only if route requires query args
    "write": {                       # omit for read-only
        "method":  "POST",
        "path":    "/api/tiresias/agentic-os/<slug>/<entity>",
        "payload": {...},
        "verify":  "echo",            # 'echo' or 'list'
    },
},
```

Then add the slug to the matrix in `.github/workflows/ci.yml`:

```yaml
matrix:
  os_slug:
    - all
    # ...
    - <new-slug>
```

## Reference

- Harness: [`scripts/smoke-test.py`](../../scripts/smoke-test.py)
- CI matrix: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- Architecture: [`docs/architecture/agentic-os.md`](../architecture/agentic-os.md)
- Audit semantics: [`docs/architecture/audit-log.md`](../architecture/audit-log.md)
- Flags semantics: [`docs/architecture/feature-flags.md`](../architecture/feature-flags.md)
