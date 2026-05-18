# ADR-003b: Legacy platform-api Tests — Gating Policy

> Status: accepted (May 2026, platform/unification-v3)
> Supersedes: prior implicit policy of `pytest --ignore=tests/platform || true`

## Context

The `apps/platform-api/tests/` tree has accumulated ~600+ tests over multiple
generations of the SoulAuth codebase. As of v3 unification, three populations
exist side-by-side:

1. **`tests/platform/`** — the new v2/v3 platform unification tests
   (worker queue, sovereign main, auth router). Already gating since v2.
2. **Legacy collection-clean tests** — pure-Python unit tests that import
   without `pydantic_settings`, the `tiresias` package, or other heavy
   runtime deps. The vast majority of these pass against the bare CI image.
3. **Legacy collection-broken or runtime-flaky tests** — depend on Postgres
   fixtures, the pre-installed `tiresias` Python module, PyJWT, or have
   drifted from the production schema. A handful of files in this group
   currently fail or error during collection.

Prior CI step ran `pytest --ignore=tests/platform || true` which masked
ALL legacy failures, hiding both pre-existing bugs and any new regressions
v3 might introduce.

## Decision

Split the legacy run into two CI steps:

1. **Legacy gating** — runs only the paths listed in
   `apps/platform-api/tests/legacy_gating_allowlist.txt`. These paths
   were verified passing on a fresh sandbox (no Postgres, no `tiresias`
   module). Failures here **block merge**.
2. **Legacy advisory** — runs everything else in `tests/` (excluding
   `tests/platform/` and the allowlist). Failures here are reported but
   **do not block merge**.

The allowlist is the single source of truth. To promote a new directory:
verify it passes locally, append it to the file, open a PR.

## Why an allowlist (not a denylist)

* New tests added under `tests/<new-area>/` default to advisory until
  someone explicitly opts them into gating. This prevents accidentally
  breaking CI when a new subdir gets imported but has runtime deps.
* The denylist of broken paths drifts as tests are fixed; the allowlist
  drifts only as new gating-eligible paths are added — a one-way ratchet.
* Easy to grep: `cat legacy_gating_allowlist.txt` shows exactly what
  guards the merge bar.

## Scope explicitly excluded from v3

* **Fixing the runtime-flaky legacy tests** (test_local table-drift,
  test_policy, test_tier_enforcement, test_trial, test_partner_admin,
  test_partner_types). These are pre-existing failures unrelated to
  unification. They remain in the advisory bucket and will be addressed
  in a separate effort.
  * `test_partner_admin.py` and `test_partner_types.py` were initially
    promoted to gating during slice 8 because they collected cleanly
    on the local probe machine, but failed under the bare CI image
    against SQLite (PostgreSQL-only `ILIKE`, `now()`, and a
    `partner_type` column that requires a migration not run in unit
    tests). They were demoted back to advisory in slice 10.
* **Contract tests** (`apps/platform-web/src/__tests__/contracts/`).
  These hit the dashboard service on port 8900, which is not part of
  the v3 unified compose stack. They remain excluded from the gating
  vitest run. A future change can wire them into the smoke job once
  the dashboard service joins the default profile, or add a
  `workflow_dispatch`-triggered job.

## Consequences

* The next legacy regression introduced under an allowlisted path will
  break CI immediately, instead of silently passing.
* Teams adding new legacy directories must consciously opt in to gating
  by editing the allowlist — visible in PR review.
* Discrepancies between gating and advisory are visible in the CI summary,
  giving future contributors a clear todo list.
