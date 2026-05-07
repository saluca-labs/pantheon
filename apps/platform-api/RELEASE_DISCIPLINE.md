# Release discipline

Established 2026-04-15 after parity audit (`Z:/_planning/tiresias-deep-audit-2026-04-14/CODEBASE_PARITY_2026-04-15.md`) found 166 dirty files and zero git-to-image traceability.

## The rule

**No image gets built or deployed without a matching git tag on the SHA that produced it.**

## Per-component tag format

`<component>-v<semver>`

Examples:
- `proxy-v0.6.22`
- `soulwatch-v2.6.7`
- `portal-v3.6.11`
- `billing-aggregator-v0.1.6`

## Process for every release

1. Make changes, commit them, push to `origin/main`.
2. Create the per-component git tag pointing at the merge SHA: `git tag <component>-v<X.Y.Z> <sha> -m "<short note>"`
3. Push the tag: `git push origin <component>-v<X.Y.Z>`
4. Run cloudbuild against that exact tag: `gcloud builds submit --config=cloudbuild-<component>-v<X.Y.Z>.yaml --substitutions=_GIT_REF=<component>-v<X.Y.Z>` (or however the build is wired).
5. Verify the deployed image SHA matches the tag commit: `git rev-parse <component>-v<X.Y.Z>` should equal the SHA embedded in the image label.

## Why this matters

- **Rollback**: `git checkout proxy-v0.6.20` recovers the exact code that's running in prod if the new release breaks.
- **Audit/compliance**: SOC2, ISO 42001, EU AI Act all require demonstrable code-to-deployment traceability. This satisfies it.
- **Recovery**: GitHub becomes the canonical record. Local disk failure no longer destroys deployable history.
- **Collaboration**: Any new dev can `git checkout <tag>` and reproduce the running prod state byte-for-byte.

## Retroactive tags created 2026-04-15

All point at SHA `7a680be2` (the commit that captured the working state of code shipped in current prod images):

| Tag | Component | Notes |
|-----|-----------|-------|
| `proxy-v0.6.21` | tiresias-proxy | hash-chained audit + redaction + soulgate wiring |
| `soulgate-v2.5.0` | soulgate | LLM policy eval, /v1/* default endpoint pattern |
| `soulwatch-v2.6.6` | soulwatch | quarantine handler, dry_run/enforce mode |
| `soulauth-v3.6.2` | soulauth | identity + tenant + license + JWT kid rotation |
| `portal-v3.6.10` | portal | em-dash fix + UpgradePrompt + retention page |
| `marketing-v3.6.2` | portal-marketing | header propagation middleware |
| `billing-aggregator-v0.1.5` | billing-aggregator | RLS-GUC fix + pricing v4 per-unit scaling |
| `retention-v0.1.2` | retention CronJob | per-tenant retention enforcement |

## Single-repo tags vs monorepo tags

The operator is a separate repo (`cristianxruvalcaba-coder/tiresias-operator`) so it uses simple semver tags (`v0.1.0`).

Monorepo (`salucallc/tiresias`) requires the `<component>-` prefix because each subdirectory has independent release cadences.
