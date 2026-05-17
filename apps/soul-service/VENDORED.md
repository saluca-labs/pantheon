# Vendored: soul

This directory contains a vendored copy of the Soul cryptographic memory
system. The contents of `soul/` are not Pantheon source — they are imported
verbatim from an external Apache 2.0 project. Pantheon-specific shims
(`Dockerfile`, `pantheon_entry.py`) live alongside the package but outside it.

## Upstream

- **Repository:** https://github.com/cristianxruvalcaba-coder/soul
- **PyPI:** https://pypi.org/project/soul-memory/
- **License:** Apache License 2.0 (preserved in `LICENSE`)
- **Vendored revision:** `4b70d88a88401ef8ad34ead2691273c63dc233af`
- **Vendored on:** 2026-05-17

The exact commit is recorded above so reviewers can diff against the
upstream tree. Bump this SHA whenever `scripts/vendor-soul.sh` is re-run.

## Approach

Vendored by **copy script** (`scripts/vendor-soul.sh`), not git subtree.
Subtree was evaluated but rejected because:

1. The upstream working copy lives on a Windows network share (`Z:/soul` /
   `//nas00/repos/soul`) which `git` flags as "dubious ownership", making
   `git subtree add --prefix=apps/soul-service file://Z:/soul` unreliable.
2. Subtree squashes still carry upstream history into Pantheon's log,
   which we want to keep linear — the canonical history lives upstream.
3. Self-hosters cloning Pantheon should not need access to a private NAS
   path to refresh the vendor.

The copy script is idempotent, scrubs hardcoded fallback credentials, and
records the upstream SHA. Subtree can be revisited later by pointing at the
public GitHub URL.

## What was vendored

| Layer | Files |
|---|---|
| Package sources | `soul/{__init__,compression,gcp_config,graph,hashing,local_buffer,prefetch,serve,storage,tkhr}.py` |
| Tests | `soul/tests/{__init__,test_local_buffer,test_session_continuity}.py` |
| Docs | `README.md`, `ARCH.md`, `PAPER.md`, `LICENSE`, `pyproject.toml` |
| Reference | `Dockerfile.upstream` (kept for diffing; not used in CD) |

## What was deliberately excluded

| Path | Reason |
|---|---|
| `soul-paper.tex` | 52 KB LaTeX source; not runtime-relevant. PAPER.md is the rendered companion. |
| `.git`, `.github`, `.pytest_cache`, `__pycache__` | Build/VCS artifacts. |

## Scrubs applied at vendor time

The copy script (`scripts/vendor-soul.sh`) rewrites two classes of leaked
defaults before they land in Pantheon:

1. **Hardcoded Supabase fallback URL** — upstream `storage.py`, `graph.py`,
   `hashing.py`, `prefetch.py`, and `tkhr.py` ship with
   `os.getenv('SUPABASE_URL', 'https://cgtuoiggcngldtzfqosm.supabase.co')`
   as a module-level default. That host is Cristian's personal Supabase
   project and must never be a fallback for self-hosters. The script
   rewrites the default to `''`.
2. **Placeholder JWT default** — the same files ship with a multi-line
   `os.getenv('SUPABASE_SERVICE_KEY', (...".REDACTED_ROTATED"))` default.
   The value is already redacted (so no real credential leaked upstream)
   but the placeholder is confusing for self-hosters and would make a
   `create_client(...)` call fail loudly mid-request rather than at boot.
   The script rewrites the default to `''`.

Both scrubs are idempotent — re-running the vendor script on an already
scrubbed tree is a no-op.

## How to refresh

```bash
# Pull from default upstream (Cristian's NAS clone):
scripts/vendor-soul.sh

# Or from any other checkout:
SOUL_UPSTREAM=/path/to/soul scripts/vendor-soul.sh

# Bump the recorded SHA in this file to the new revision, then commit:
git add apps/soul-service/ VENDORED.md
git commit -m "chore(soul-service): refresh vendor to <sha>"
```

## Edit policy

**Edit upstream first.** Any change to files under `soul/` will be
clobbered the next time the vendor script runs. The correct fix path is:

1. Open a PR upstream against
   https://github.com/cristianxruvalcaba-coder/soul.
2. Once merged + released, run `scripts/vendor-soul.sh` to pull the new
   revision into Pantheon.
3. Commit the refresh as a chore.

Pantheon-specific glue (auth middleware, health endpoints, Dockerfile,
k8s manifests) belongs OUTSIDE `soul/` — see `pantheon_entry.py` and
`Dockerfile` for the current pattern. That code is safe to edit in-place.

## What runs and what does not (vs. ARCH.md)

The vendored `serve.py` exposes a narrow REST surface (memory read/write,
TKHR lookup, integrity check) — about 70 lines of FastAPI. Most of the
GCP component map described in `ARCH.md` (Vertex AI summarization, Pub/Sub
triggers, Cloud KMS HMAC, Vector Search, Firestore hot tier, Cloud
Scheduler GOS job) is **not implemented in the vendored code** — it is
the target architecture for the Cloud Run deployment, not what ships with
the PyPI package.

The pieces that DO run in the vendored service today:

- **Tier 0** — SQLite active buffer (`local_buffer.py`). Always on. Path
  controlled by `SOUL_BUFFER_PATH`.
- **Tier 1** — in-process dict cache. Always on.
- **Tier 2** — Supabase cold tier (`storage.py`). Activates when
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set. Without them, writes
  fail at `create_client` time. For the Pantheon deployment we either
  (a) provide Supabase credentials, or (b) switch the cold tier to
  Pantheon's Postgres — the latter requires an upstream PR to add a
  Postgres adapter alongside the existing Supabase one.
- **Hashing + TKHR** — pure Python, no external deps. Always on.
- **Compression** — calls Anthropic via `ANTHROPIC_API_KEY`. Optional.
- **Vertex AI, Pub/Sub, KMS, Vector Search, Scheduler GOS** — not in the
  vendored code at all. These are future work tracked upstream.
