# Creator OS — Pantheon-Native Execution Plan

## Locked Decisions

1. **Co-process services vs native**: NATIVE. All Docker co-processes (Flowise, Activepieces, Owncast) dropped. Everything runs inside the Pantheon Next.js app.
2. **Auth**: SOULAUTH. Re-exports from `_shared/session.ts` via `getCurrentOsUser()`.
3. **Database**: REUSE PANTHEON POSTGRES. Same Alembic chain, same `pg.Pool`. No Prisma, no SQLite.
4. **Scope at v1**: SOLO-FIRST. Single user per deployment. Multi-tenant deferred.
5. **Rich editor**: TIPTAP. `@tiptap/react` v3 for all content surfaces. Content stored as TipTap JSON in JSONB columns.
6. **Assets**: URL-ONLY CONTRACT. No file upload handling, no multipart parsing, no local filesystem writes. All media referenced by URL.
7. **Export**: PANDOC SUBPROCESS. `child_process.exec('pandoc ...')` for DOCX/PDF/ePub. No `archiver` package needed.
8. **AI Coach modes**: FIVE MODES — content_strategist, writing_coach, audience_builder, monetization_advisor, general.
9. **AI Chat**: MULTI-MODEL via Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`).
10. **No standalone MCP server or CLI**. Dropped from scope.

## Pantheon Phase Pattern

Every phase follows the same sequence:
1. **Migration** — Raw SQL via Alembic `op.execute()`, UUID PKs with `gen_random_uuid()`, no FKs on user_id
2. **Domain types** — Pure TypeScript interfaces in `lib/agentic-os/creator/<entity>.ts`
3. **Repo** — `server-only` DB calls via `pg.Pool`, parameterized queries
4. **API routes** — Next.js Route Handlers under `api/tiresias/agentic-os/creator/`
5. **Components** — React/TSX under `components/agentic-os/creator/`
6. **Pages** — Server components under `app/(dashboard)/dashboard/creator/`
7. **Registry update** — Feature cards added to `registry.ts`

**Cross-cutting**:
- Audit: `recordAudit` from `_shared/audit.ts` with `osSlug: 'creator'`
- Session: `getCurrentOsUser()` from `_shared/session.ts` (re-export as `getCurrentCreatorUser`)
- Pool: `getOsPool()` from `_shared/session.ts` (re-export as `getCreatorPool`)

---

## Phase 1 — Content Hub + Notes Workspace

**Migration:** `0062_creator_phase1.py`
- Table `agos_creator_notes`:
  - `id` UUID PK DEFAULT gen_random_uuid()
  - `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL DEFAULT 'Untitled'
  - `content` JSONB NOT NULL DEFAULT '{}' (TipTap JSON)
  - `icon` TEXT
  - `cover_image_url` TEXT
  - `parent_id` UUID (self-referential for nesting)
  - `position` INT NOT NULL DEFAULT 0
  - `tags` TEXT[] NOT NULL DEFAULT '{}'
  - `is_pinned` BOOLEAN NOT NULL DEFAULT false
  - `archived_at` TIMESTAMPTZ
  - `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
  - `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- Indexes: `idx_creator_notes_user` on (user_id, updated_at DESC), partial `idx_creator_notes_pinned` WHERE is_pinned = true, partial `idx_creator_notes_active` WHERE archived_at IS NULL, `idx_creator_notes_parent` on (parent_id)
- `updated_at` trigger (standard pattern)

**Domain types:** `lib/agentic-os/creator/notes.ts`
- `CreatorNote` interface, `CreateCreatorNoteInput`, `UpdateCreatorNoteInput`, `ListCreatorNotesOpts`

**Repo:** `lib/agentic-os/creator/notes-repo.ts`
- `listNotes(userId, opts?)`, `getNote(id, userId)`, `createNote(input, userId)`, `updateNote(id, userId, input)`, `archiveNote(id, userId)`, `restoreNote(id, userId)`, `deleteNote(id, userId)`
- Audit on create/update/archive/delete: `creator.note.created`, `creator.note.updated`, `creator.note.archived`, `creator.note.deleted`

**Session:** `lib/agentic-os/creator/session.ts`
- Re-exports from `_shared/session.ts`:
  - `getCurrentOsUser as getCurrentCreatorUser`
  - `getOsPool as getCreatorPool`
  - Type: `OsSessionUser as CreatorSessionUser`

**API routes:** `app/api/tiresias/agentic-os/creator/notes/`
- `route.ts` — GET list + POST create
- `[noteId]/route.ts` — GET/PATCH/DELETE with ownership checks
- `[noteId]/archive/route.ts` — POST archive
- `[noteId]/restore/route.ts` — POST restore

**Shared component:** `components/agentic-os/_shared/tiptap-editor.tsx`
- `'use client'` component wrapping `@tiptap/react` with StarterKit, Placeholder, TaskList, TaskItem, Underline, Link, Image extensions
- Props: `{ content: JSON, onChange: (json: JSON) => void, placeholder?: string, editable?: boolean }`
- Styled for dark theme (`prose-invert`)

**Components:**
- `components/agentic-os/creator/note-tree.tsx` — Recursive sidebar tree with expand/collapse, drag-to-reorder, context menu (rename, archive, delete, add child)
- `components/agentic-os/creator/creator-hub.tsx` — Landing page with pinned notes grid, recent notes list, quick-create button

**Pages:**
- `app/(dashboard)/dashboard/creator/page.tsx` — Creator hub (server component, fetches pinned + recent notes)
- `app/(dashboard)/dashboard/creator/notes/[noteId]/page.tsx` — Note detail with TipTap editor, auto-save via debounced PATCH

**Packages to install:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-image`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Registry:** Update Creator OS features array with `notes` and `hub` cards.

---

## Phase 2 — Publishing / Newsletter

**Migration:** `0063_creator_phase2.py`
- Table `agos_creator_posts`:
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL, `slug` TEXT NOT NULL UNIQUE
  - `excerpt` TEXT, `content` JSONB NOT NULL DEFAULT '{}' (TipTap JSON)
  - `cover_image_url` TEXT
  - `status` TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('idea','draft','scheduled','published','archived'))
  - `scheduled_at` TIMESTAMPTZ, `published_at` TIMESTAMPTZ
  - `tags` TEXT[] NOT NULL DEFAULT '{}'
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: `idx_creator_posts_user` on (user_id, status, updated_at DESC), `idx_creator_posts_slug` UNIQUE on (slug), `idx_creator_posts_published` partial WHERE status = 'published'
- Table `agos_creator_subscribers`:
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `email` TEXT NOT NULL, `name` TEXT
  - `status` TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced'))
  - `source` TEXT, `created_at`, `updated_at` TIMESTAMPTZ
  - UNIQUE on (user_id, email)
- Indexes: `idx_creator_subs_user` on (user_id, status)

**Domain types:** `lib/agentic-os/creator/posts.ts`, `lib/agentic-os/creator/subscribers.ts`

**Repos:** `posts-repo.ts`, `subscribers-repo.ts`
- Posts CRUD, status transitions (publish, schedule, archive), slug auto-generation with collision handling
- Subscribers CRUD, import CSV (parse only, no file upload — paste or fetch from URL), status management

**API routes:**
- `api/tiresias/agentic-os/creator/posts/` — CRUD + publish/schedule actions
- `api/tiresias/agentic-os/creator/subscribers/` — CRUD + import
- `api/tiresias/agentic-os/creator/rss.xml/route.ts` — RSS feed (returns published posts as RSS 2.0)

**Components:** `post-list.tsx`, `post-editor.tsx` (reuses shared TipTapEditor), `subscriber-table.tsx`

**Pages:**
- `creator/posts/` — Post list with status filters
- `creator/posts/[postId]/` — Post editor
- `creator/subscribers/` — Subscriber management

**No email sending.** Reserved for Phase 8+.

---

## Phase 3 — Book Writing

**Migration:** `0064_creator_phase3.py`
- Table `agos_creator_books`:
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL, `description` TEXT, `cover_image_url` TEXT
  - `status` TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','writing','complete','published'))
  - `created_at`, `updated_at` TIMESTAMPTZ
- Table `agos_creator_chapters`:
  - `id` UUID PK, `book_id` UUID NOT NULL
  - `title` TEXT NOT NULL, `content` JSONB NOT NULL DEFAULT '{}' (TipTap JSON)
  - `order` INT NOT NULL DEFAULT 0, `word_count` INT NOT NULL DEFAULT 0
  - `status` TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','revised','final'))
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: `idx_creator_books_user` on (user_id), `idx_creator_chapters_book` on (book_id, order)

**Domain types:** `lib/agentic-os/creator/books.ts`

**Repo:** `books-repo.ts` — Books CRUD, chapters CRUD with reorder, word_count denormalized on save

**Utility:** `lib/agentic-os/creator/tiptap-to-md.ts`
- `tiptapJsonToMarkdown(json: JSON): string` — Recursive walker supporting 12+ node types (paragraph, heading, bulletList, orderedList, listItem, taskList, taskItem, codeBlock, blockquote, hardBreak, horizontalRule, image) and 5+ mark types (bold, italic, code, link, strikethrough)

**API routes:**
- `api/tiresias/agentic-os/creator/books/` — CRUD
- `api/tiresias/agentic-os/creator/books/[bookId]/chapters/` — CRUD + reorder
- `api/tiresias/agentic-os/creator/books/[bookId]/export/route.ts` — POST { format: 'docx'|'pdf'|'epub' } → Pandoc subprocess → file download

**Components:** `book-list.tsx`, `book-editor.tsx` (two-panel: chapter tree left, TipTap editor right), `chapter-reorder.tsx` (drag-and-drop), `export-button.tsx`

**Pages:**
- `creator/books/` — Book list
- `creator/books/[bookId]/` — Book editor with chapters

---

## Phase 4 — Podcast

**Migration:** `0065_creator_phase4.py`
- Table `agos_creator_podcasts`:
  - `id` UUID PK, `user_id` TEXT NOT NULL UNIQUE (one show per user)
  - `title` TEXT NOT NULL, `description` TEXT, `author` TEXT
  - `cover_image_url` TEXT, `language` TEXT NOT NULL DEFAULT 'en'
  - `category` TEXT, `explicit` BOOLEAN NOT NULL DEFAULT false
  - `website_url` TEXT, `created_at`, `updated_at` TIMESTAMPTZ
- Table `agos_creator_episodes`:
  - `id` UUID PK, `podcast_id` UUID NOT NULL
  - `title` TEXT NOT NULL, `description` TEXT, `notes_md` TEXT (show notes)
  - `audio_file_url` TEXT (URL-only contract)
  - `duration_seconds` INT, `file_size_bytes` BIGINT, `mime_type` TEXT
  - `season_number` INT, `episode_number` INT
  - `episode_type` TEXT NOT NULL DEFAULT 'full' CHECK (episode_type IN ('full','trailer','bonus'))
  - `status` TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))
  - `published_at` TIMESTAMPTZ
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: `idx_creator_eps_podcast` on (podcast_id, season_number, episode_number), `idx_creator_eps_published` partial WHERE status = 'published'

**Domain types:** `lib/agentic-os/creator/podcast.ts`

**Repo:** `podcast-repo.ts` — Show CRUD (upsert semantics since one per user), episodes CRUD with season/episode numbering

**API routes:**
- `api/tiresias/agentic-os/creator/podcast/` — GET/PUT show config
- `api/tiresias/agentic-os/creator/podcast/episodes/` — CRUD + publish
- `api/tiresias/agentic-os/creator/podcast.xml/route.ts` — Podcasting 2.0 RSS feed (iTunes namespace + podcastindex.org namespace)

**Components:** `episode-list.tsx`, `episode-form.tsx`, `audio-player.tsx` (wraps Plyr)

**Pages:**
- `creator/podcast/` — Podcast dashboard with episode list
- `creator/podcast/episodes/[episodeId]/` — Episode detail with Plyr player
- `creator/podcast/settings/` — Show settings

**Package:** `plyr` (audio player, MIT)

---

## Phase 5 — Video

**Migration:** `0066_creator_phase5.py`
- Table `agos_creator_video_assets`:
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL, `description` TEXT
  - `url` TEXT NOT NULL (HLS manifest URL — URL-only contract)
  - `thumbnail_url` TEXT
  - `duration_seconds` INT
  - `status` TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed'))
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: `idx_creator_videos_user` on (user_id, status)

**Domain types:** `lib/agentic-os/creator/video.ts`

**Repo:** `video-repo.ts` — CRUD, no file handling, no ffmpeg, no transcoding. URL-only.

**API routes:** `api/tiresias/agentic-os/creator/videos/` — CRUD

**Components:** `video-list.tsx`, `video-player.tsx` (wraps Video.js with HLS support), `video-form.tsx`

**Pages:**
- `creator/videos/` — Video library
- `creator/videos/[videoId]/` — Video detail with HLS player

**Package:** `video.js` (Apache-2.0)

---

## Phase 6 — AI Chat

**Migration:** `0067_creator_phase6.py`
- Table `agos_creator_conversations`:
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL DEFAULT 'New Conversation'
  - `model` TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
  - `system_prompt` TEXT
  - `messages` JSONB NOT NULL DEFAULT '[]' (inline JSONB array, same pattern as Business coach sessions)
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: `idx_creator_convos_user` on (user_id, updated_at DESC)

**Domain types:** `lib/agentic-os/creator/chat.ts`
- `CreatorConversation`, `ChatMessage { role, content }`, `CreateConversationInput`

**Repo:** `chat-repo.ts` — Conversations CRUD, message append (JSONB concat)

**API routes:**
- `api/tiresias/agentic-os/creator/chat/conversations/` — GET list + POST create
- `api/tiresias/agentic-os/creator/chat/conversations/[id]/` — GET/PATCH/DELETE
- `api/tiresias/agentic-os/creator/chat/conversations/[id]/messages/route.ts` — Streaming endpoint (Node.js runtime, U+001E wire format, same as Business coach)

**Models:** claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5, gpt-4o, gpt-4o-mini, plus ollama/* prefix for local models

**Components:** `chat-sidebar.tsx`, `chat-window.tsx` (useChat from @ai-sdk/react), `model-picker.tsx`, `system-prompt-editor.tsx`

**Pages:**
- `creator/chat/` — Chat hub (or redirect to latest/new conversation)
- `creator/chat/[conversationId]/` — Chat interface

**Packages:** `ai` (Vercel AI SDK), `@ai-sdk/react`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `react-markdown`, `remark-gfm`, `rehype-highlight`

---

## Phase 7 — AI Content Coach

**Migration:** `0068_creator_phase7.py`
- Table `agos_creator_coach_sessions`:
  - Same pattern as `agos_business_coach_sessions` (migration 0061)
  - `id` UUID PK, `user_id` TEXT NOT NULL
  - `title` TEXT NOT NULL DEFAULT 'New session'
  - `mode` TEXT NOT NULL CHECK (mode IN ('content_strategist','writing_coach','audience_builder','monetization_advisor','general'))
  - `model` TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
  - `messages` JSONB NOT NULL DEFAULT '[]'
  - `archived_at` TIMESTAMPTZ
  - `created_at`, `updated_at` TIMESTAMPTZ
- Indexes: same pattern as business coach sessions

**Modes:**
| Mode | Label | Description |
|------|-------|-------------|
| content_strategist | Content Strategist | Editorial planning, topic clusters, content calendars |
| writing_coach | Writing Coach | Draft review, tone, structure, headlines |
| audience_builder | Audience Builder | Growth tactics, engagement, subscriber conversion |
| monetization_advisor | Monetization Advisor | Pricing, sponsorships, product-market fit |
| general | General Assistant | Any creator-related question |

**Hard rules (same pattern as Business coach):**
1. Never invent metrics or audience numbers
2. Never generate plagiarized content or verbatim passages from copyrighted works
3. Refuse legal/financial/tax advice → refer to attorney/CPA

**Files:**
- `lib/agentic-os/creator/coach/modes.ts` — Mode taxonomy
- `lib/agentic-os/creator/coach/anthropic.ts` — Provider + config check
- `lib/agentic-os/creator/coach/context.ts` — Per-mode context builder
- `lib/agentic-os/creator/coach/system-prompt.ts` — System prompt templates
- `lib/agentic-os/creator/coach/sessions-repo.ts` — Session CRUD
- API routes under `api/tiresias/agentic-os/creator/coach/` — Same pattern as business coach
- Components: `coach-hub.tsx`, `coach-session.tsx`, `coach-mode-picker.tsx`
- Pages: `creator/coach/`, `creator/coach/[sessionId]/`
- **Coach CTAs** added to: post editor page, book editor page, podcast page

---

## Dependency Graph

```
Phase 1 (Notes + Hub + Shared TipTap + Session)
  └─► Phase 2 (Publishing)
  └─► Phase 3 (Book Writing)
  └─► Phase 4 (Podcast)
  └─► Phase 5 (Video)
  └─► Phase 6 (AI Chat)
        └─► Phase 7 (AI Coach) ← depends on Phase 1 + Phase 6 patterns
```

Phases 2-5 are independent of each other and can be built in parallel after Phase 1 completes. Phase 6 can also start after Phase 1. Phase 7 requires Phase 6 patterns (streaming endpoint) but not Phase 6 completion — can reference the Business coach pattern directly.

---

## Registry (Final State)

Creator OS features array after all 7 phases:
```typescript
features: [
  { href: '/dashboard/creator', label: 'Hub', description: 'Pinned notes, recent work, and quick-create.' },
  { href: '/dashboard/creator/notes', label: 'Notes', description: 'Nested workspace with TipTap editor, tags, and drag-and-drop tree.' },
  { href: '/dashboard/creator/posts', label: 'Publishing', description: 'Blog/newsletter posts with scheduling, RSS feed, and subscriber management.' },
  { href: '/dashboard/creator/books', label: 'Books', description: 'Long-form writing with chapters, word-count tracking, and Pandoc export.' },
  { href: '/dashboard/creator/podcast', label: 'Podcast', description: 'Episode management with Podcasting 2.0 RSS feed and Plyr audio player.' },
  { href: '/dashboard/creator/videos', label: 'Videos', description: 'Video library with HLS playback via Video.js.' },
  { href: '/dashboard/creator/chat', label: 'AI Chat', description: 'Multi-model chat with streaming, conversation history, and system prompts.' },
  { href: '/dashboard/creator/coach', label: 'AI Coach', description: 'Five-mode content coach: strategy, writing, audience, monetization, and general.' },
]
```

## Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `DATABASE_URL` | Yes | pg.Pool (shared) |
| `ANTHROPIC_API_KEY` | For coach | Phase 7 |
| `OPENAI_API_KEY` | For chat | Phase 6 |
