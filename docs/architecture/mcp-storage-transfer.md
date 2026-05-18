# MCP-Mediated Storage Transfer — Architecture Design

**Status:** Proposal
**Date:** 2026-05-10
**Workstream:** Cross-OS asset attachment (Filmmaker Phase 3/6, Health Phase 5b, Creator, future)

## 1. Architecture overview

Pantheon's invariant from migration `0021_filmmaker_project_meta.py` is explicit: `cover_image_url` is "free-form URL string only — there is no upload UI and no managed asset table." The same shape exists in `0018_health_os_phase5b.py` (`recipes.image_url`). The question this doc answers is *how* a user — sitting in a browser at `pantheon.saluca.com`, served from GKE — gets a file from their machine, through whatever storage they already have, into that text column, without pantheon ever holding bytes.

### Options evaluated

**A. Browser-side MCP bridge (Tailscale / local relay).** Pantheon UI opens a WebSocket to a local MCP relay the user runs on their machine. Auth via Tailscale identity or magic link. The relay invokes `mcp__claude_ai_Google_Drive__create_file`, returns the share URL.
*Pros:* Real "MCP-mediated." Reuses Cristian's existing MCP fleet (Drive, Notion, GitHub, Telegram).
*Cons:* Every user needs Tailscale + a long-running daemon on their device. Mobile is dead. The relay must reproduce Anthropic's MCP auth surface. Cross-user multi-tenant is messy (whose Drive token?). This is "Alfred mesh client for everyone" — not a product, an infrastructure tax.

**B. Server-side provider OAuth in pantheon (MCP in name only).** Pantheon stores per-user OAuth tokens for Google Drive / Dropbox / OneDrive, hits provider REST APIs from `platform-api` (FastAPI). The "MCP" label is decorative — this is just standard OAuth integration.
*Pros:* Works on any device, no client install. Server can generate signed URLs, run virus scans, enforce quotas. Pantheon controls the access token lifecycle.
*Cons:* Pantheon becomes a custodian of provider OAuth tokens (a target). Token refresh + rotation + revocation handling is *not optional*. Contradicts the "no native object store, no token custody" stance the rest of the platform is taking. Slow to ship — at least one OAuth dance per provider, per OS phase that wants assets.

**C. Pantheon-bridge CLI / desktop helper.** User installs `pantheon-bridge`. The bridge holds a persistent SSE connection to pantheon, exposes a local MCP runtime, and proxies storage calls.
*Pros:* Architecturally clean — pantheon never sees tokens; the bridge does. Composable with the rest of Alfred mesh.
*Cons:* Adoption barrier (install + run a daemon) is high for filmmakers and creators. No mobile. We do not have such a CLI today; building it is *itself* a workstream comparable in size to Filmmaker Phase 2.

**D. Hybrid — paste-URL today, optional `pantheon-attach` CLI later.** Pantheon UI stays exactly as it is in `project-hub-actions.tsx`: a plain `<input type="url">` for `coverImageUrl`. We ship a small, optional companion CLI `pantheon-attach <file> [--to drive|r2|notion]` that uses the user's local MCP / CLI tools to upload the file and *prints the resulting URL to stdout*. The user pastes that URL into pantheon. Pantheon stores zero new infrastructure.
*Pros:* Time-to-MVP measured in days, not months. Mobile works (paste any URL — Drive share link, Notion attachment URL, S3 signed URL, R2 public URL). Zero token custody. Optional CLI inherits whatever MCP / OAuth the user already has on their workstation — no duplicated setup. The architecture is *forward-compatible* with B and C: any of those can later replace the manual paste, and the DB schema does not change.
*Cons:* It's lo-fi. Users do see a URL field. There is no garbage collection, no thumbnail proxy, no "list my Drive folder" picker (at MVP).

### Recommendation

**Option D — Hybrid paste-URL with an optional `pantheon-attach` CLI.**

Rationale: pantheon's value proposition is workflow, not file hosting. The just-resolved decision ("no native object store") was *correct*, and reading 0021 makes that explicit — the column comment already names "MCP-mediated storage transfer" as the future workstream while keeping the column as plain TEXT. Option D is the only path that respects that contract without committing pantheon to either (i) hosting user OAuth tokens or (ii) shipping a desktop daemon. It also unblocks the Filmmaker Phase 3 cover-image, Phase 6 storyboard panel, and Health recipe image features *today* — they already work, because they accept any URL.

The "MCP" in the workstream name is honest under D: the CLI is the MCP boundary. Pantheon delegates to MCP-equipped agents (the user's local Claude/Cursor with MCP servers, or `pantheon-attach`) and only stores the post-upload URL.

### ASCII flow

```
                                         ┌─ Drive ──┐
                                         │ Dropbox  │
  ┌────────┐    ┌──────────────────┐    ┌┴──────────┴┐
  │Browser │───>│ pantheon UI      │    │ user's     │
  │ user   │    │ (Next.js, GKE)   │    │ storage    │
  └────────┘    │                  │    └────────────┘
       │        │  ┌────────────┐  │           ▲
       │ paste  │  │ <input>    │  │           │ upload via
       │  URL   │  │ url field  │  │           │ MCP server /
       │        │  └────────────┘  │           │ provider SDK
       │        └────────┬─────────┘           │
       │                 │ writes              │
       │                 ▼                     │
       │        ┌──────────────────┐           │
       │        │ Postgres         │           │
       │        │ agos_*           │           │
       │        │ *_image_url TEXT │           │
       │        └──────────────────┘           │
       │                                       │
       │       ┌──────────────────────┐        │
       └──────>│ pantheon-attach CLI  │────────┘
   stdin/file  │ (optional, separate  │   prints URL on stdout
               │  binary, ships later)│
               └──────────────────────┘
                         │
                         ▼
                    user's local MCP
                    (Drive, Notion, GitHub,
                     R2 wrangler, yt-dlp …)
```

The display path is symmetric: pantheon's `<img src={project.coverImageUrl}>` in `apps/platform-web/src/app/(dashboard)/dashboard/filmmaker/projects/[id]/page.tsx` fetches directly from the user's storage — pantheon never proxies bytes.

## 2. Data model

**MVP: no new tables.** The existing pattern (`cover_image_url TEXT`, `image_url TEXT`) is correct. Migration 0021's column comment is the contract.

What we add when the MVP+1 needs garbage-collection or a "my attachments" view:

```sql
-- 0022_agos_user_storage_providers (deferred)
CREATE TABLE agos_user_storage_provider (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL,
  kind             TEXT NOT NULL,   -- 'drive'|'dropbox'|'r2'|'notion'|'manual'
  label            TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'active', -- active|revoked|error
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, label)
);

-- 0023_agos_asset (deferred — only if we want tracked GC + re-attach)
CREATE TABLE agos_asset (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL,
  tenant_id        UUID NOT NULL,
  provider_id      UUID REFERENCES agos_user_storage_provider(id) ON DELETE SET NULL,
  external_id      TEXT,            -- Drive fileId, Notion blockId, …
  display_url      TEXT NOT NULL,
  mime_type        TEXT,
  size_bytes       BIGINT,
  original_filename TEXT,
  attached_to_kind TEXT,            -- 'filmmaker_project.cover_image' | 'health_recipe.image' …
  attached_to_id   UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agos_asset_user_idx ON agos_asset (user_id, created_at DESC);
CREATE INDEX agos_asset_attached_idx ON agos_asset (attached_to_kind, attached_to_id);
```

**Crucially, the `*_image_url` columns stay as TEXT.** `agos_asset.display_url` is a sidecar — denormalized, advisory, used for GC and re-attach UX. If a consuming record's URL diverges from any `agos_asset.display_url`, pantheon treats the consumer's URL as authoritative. This means migration 0023 can ship later without rewriting any feature code.

Trade-off matrix:

| | URL-only (today) | + provider table | + asset table |
|--|--|--|--|
| Stale URL detection | impossible | impossible | possible (background probe) |
| "My attachments" UI | impossible | impossible | possible |
| Provider revoke handling | per-URL 404 only | warn user globally | warn + list affected records |
| Schema cost | 0 | 1 small table | 2 tables, sidecar index |
| Time to ship | shipped | ~3 days | ~5 days |

MVP picks column 1. Sidecar provider + asset tables are deferred to a later RFC.

## 3. User-facing UX

### MVP (today / next pantheon deploy)

- **No new pages, no new components.** The URL inputs already in `apps/platform-web/src/components/agentic-os/filmmaker/project-hub-actions.tsx` are the entire surface.
- **Hint copy update only.** The current placeholder "External URL only — asset uploads are a future MCP-mediated workstream" gets replaced with actionable copy: *"Paste any image URL — Google Drive share link, Dropbox link, your R2 URL. Run `pantheon-attach <file>` to upload from your machine."* (Shipped when CLI lands; until then, keep current copy.)
- **Health recipes** (`agos_health_recipes.image_url` from migration 0018) gets the same treatment when Phase 5b's recipe-edit UI lands.
- **Filmmaker Phase 3 characters / Phase 6 storyboard panels** — when these migrations are written, they use the same `TEXT` pattern, period. No special "portrait upload" UX.

### MVP+1 (`pantheon-attach` CLI)

A small Node or Python binary, published as `npx pantheon-attach` or `pip install pantheon-attach`. Invocation:

```
$ pantheon-attach ./hero-portrait.jpg --to drive --folder "Pantheon/Filmmaker/Quiet Echo"
https://drive.google.com/file/d/1ABC.../view?usp=sharing
```

Implementation detail: the CLI shells out to whatever MCP servers / provider CLIs the user already has — `gcloud storage`, `wrangler r2 object put`, `dropbox-uploader`, the Drive REST API with the user's existing OAuth (stored in `~/.config/pantheon-attach/`). Pantheon backend has no awareness of this CLI's existence.

### Settings page

**MVP: none.** No `/settings/storage` page ships, because there is nothing for pantheon to persist about a user's storage.

**MVP+1 (deferred):** `/dashboard/settings/storage` listing the user's local CLI config (read from the CLI's config file via a printable summary) — purely advisory, pantheon does not connect to anything.

### Mobile

Mobile users paste URLs. They cannot run the CLI. This is acceptable; the feature is "attach a file you already have somewhere on the web," which mobile users already accomplish by uploading to their phone's gallery → Drive sync → share link → paste. Pantheon does not need to be a mobile uploader.

### Empty state

Already correct in `[id]/page.tsx` — when `coverImageUrl` is null, a gradient placeholder with a `<Clapperboard>` icon renders. No change.

## 4. Security + permissions

### Token custody

Under Option D pantheon stores **zero OAuth tokens, zero API keys, zero credentials of any kind for any storage provider.** The `pantheon-attach` CLI holds whatever credentials it holds, locally, in the user's home directory, using the OS keychain where available. This is the entire security model and it is intentional.

### Multi-tenant isolation

URLs in `cover_image_url` are owned by the row's `user_id` / `tenant_id`. Pantheon enforces this at the query layer (every `getProject` / `updateProject` is `WHERE id = $1 AND user_id = $2`). A user pasting a Drive share link they don't actually own is fine — the URL itself is the access token; if Drive's ACL says deny, the `<img>` 404s. Pantheon is not the access control point.

### Display-time access

`<img src={project.coverImageUrl}>` works because the user's browser hits the storage URL directly with the user's browser-resident session (Google session cookie, Dropbox session cookie, etc.). For URLs that require Referer / SameSite cookies that conflict with `pantheon.saluca.com`, the URL won't render — that is the user's problem, surfaced as a broken `<img>`. We do not proxy.

For *truly private* assets the recommended pattern in the CLI's docs is: upload to R2 with a signed URL (long TTL, e.g. 7 days) and paste that signed URL. Pantheon stores the signed URL and it works for as long as it is signed. When it expires, the image breaks — user re-uploads. This is acceptable trade-off for MVP.

### Crisis path: provider revocation

If a user disconnects Google Drive entirely, every `cover_image_url` pointing at Drive returns 403/404 to the browser. The empty-state placeholder *does not* render automatically (because the URL is still in the DB, not null) — instead the `<img>` shows the browser's broken-image icon.

Mitigation, deferred to MVP+1: a server-side periodic probe (`HEAD` on `cover_image_url`) tags assets with a `last_seen_ok_at` column on `agos_asset`. The UI can then show "this image is no longer reachable — paste a new URL." Not in MVP.

### CSRF / CSP

`<img>` to arbitrary external origins is allowed today. We are not introducing new endpoints, so there is no new CSRF surface. CSP needs an `img-src` allowlist — pantheon already permits arbitrary `https://` `img-src` per the current implementation; **verify before shipping** (audit `apps/platform-web/src/middleware.ts`).

## 5. MVP scope

### What lands in the next pantheon deploy

1. **Documentation only.** This file at `docs/architecture/mcp-storage-transfer.md`. No code changes.
2. **Copy update** in `project-hub-actions.tsx` hint text — clarifying that any URL works and mentioning the future CLI. Optional, can wait.

That's it. The feature is *already shipped* — pantheon has been accepting external URLs since migration 0021. We are formalizing the architecture, not building it.

### What gets deferred

- **`pantheon-attach` CLI** — a separate workstream, not part of pantheon-the-app. Lives in `salucallc/pantheon-attach` (new repo), one engineer-week of work, ships independent of the pantheon deploy cadence.
- **`agos_user_storage_provider` table** — defer until a second feature needs storage metadata (e.g., Filmmaker Phase 6 wants thumbnails for storyboard panels and we decide to generate them server-side).
- **`agos_asset` sidecar table** — defer until we have evidence of accumulating broken URLs.
- **Settings page `/dashboard/settings/storage`** — defer until provider table exists.
- **Server-side image proxy / thumbnail generation** — defer indefinitely; reconsider when Filmmaker Phase 6 (storyboard) lands and we know panel volume.
- **Mobile upload flow** — defer indefinitely. Use Drive mobile app + share-link paste.

## 6. Risks

Ranked, worst-first:

1. **Stale URLs accumulate silently.** Six months in, half the `cover_image_url` values point at deleted Drive files. No detection. Mitigation: ship the asset sidecar + probe before we have 10k+ rows, which is later than Filmmaker Phase 6.
2. **User confusion: "where do I upload?"** Filmmakers expect an upload button. Mitigation: hint copy + a "How to attach files" doc page at `/docs/storage` (one-pager).
3. **Hot-link breakage from Drive / Dropbox.** Google sometimes serves Drive share links as HTML redirect pages, not direct image bytes. The `<img>` then breaks. Mitigation: the CLI doc page lists "good" URL shapes per provider (`https://drive.google.com/uc?id=…` for Drive).
4. **CSP `img-src` blocks providers we did not anticipate.** Mitigation: audit `middleware.ts` and current CSP; widen `img-src` to `https:` for the relevant routes if needed.
5. **CLI never gets built / never gets used.** Then we live on plain URL paste forever. That is *fine* — feature still works.
6. **No virus scan / no content moderation.** Pantheon is a user's own workspace; we tolerate this risk for MVP. If we later open shared-tenant assets, revisit.
7. **Provider rate limits.** Not pantheon's problem under D — the user's browser hits the provider directly. Pantheon never rate-limits Drive.
8. **Large file latency.** A 50MB storyboard PDF as a Drive share link will be slow to render. Mitigation in MVP+1: store a thumbnail URL separately (`cover_image_thumb_url`?) — but not now.

## 7. Recommendation

**Architecture D (hybrid paste-URL + future optional CLI). MVP scope is documentation + (optionally) one copy tweak — zero schema changes, zero code paths added. Time-to-MVP: 1 day for the doc, < 1 day for the copy change. The `pantheon-attach` CLI is a separate ~1 engineer-week effort that can land any time, in any repo, without touching pantheon.**

### Top blocking unknown

Whether pantheon's CSP `img-src` directive in `apps/platform-web/src/middleware.ts` currently allows arbitrary `https://` origins, or whether it is restricted in a way that breaks Drive / Dropbox share links. This should be verified before any user-facing rollout copy points users at "any URL works." A 5-minute audit, but it must happen before we tell users this is a feature.

### Critical files for implementation

- `packages/database/alembic/versions/0021_filmmaker_project_meta.py` — defines the contract (`cover_image_url TEXT`, with column comment pointing to this workstream)
- `apps/platform-web/src/components/agentic-os/filmmaker/project-hub-actions.tsx` — the only UI that currently exposes an attachment URL input; future copy tweak lands here
- `apps/platform-web/src/app/(dashboard)/dashboard/filmmaker/projects/[id]/page.tsx` — the display side (`<img src={project.coverImageUrl}>`); shows the empty-state placeholder pattern other OSes should mirror
- `apps/platform-web/src/middleware.ts` — CSP `img-src` directive must permit external storage origins (the blocking unknown above)
- `apps/platform-web/src/lib/agentic-os/filmmaker/repo.ts` — the tenant-isolation pattern (`WHERE id = $1 AND user_id = $2`) that every consumer of attachment URLs must replicate
