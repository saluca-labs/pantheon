# Creator OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate. Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete. Every Execute ticket includes exact file paths, package names, and commands. Validate tickets include concrete pass/fail criteria an automated agent can evaluate without ambiguity.

***

## Frozen Tech Stack (All Tickets Assume This)

| Layer | Package | License | Pin |
|---|---|---|---|
| Monorepo | `turborepo` | MIT | latest |
| Framework | `next` (App Router) | MIT | 14.x |
| Language | TypeScript | Apache-2.0 | 5.x |
| Package mgr | `pnpm` | MIT | 9.x |
| Styling | `tailwindcss` + `shadcn/ui` | MIT | 3.x |
| ORM | `prisma` + `@prisma/client` | Apache-2.0 | 5.x |
| Database | SQLite (dev) / Postgres (prod) | — | — |
| Auth | `next-auth` v5 | MIT | 5.x |
| Rich editor | `@tiptap/react` + `@tiptap/starter-kit` | MIT | 2.x |
| Notion editor | `novel` | MIT | latest |
| Audio | `plyr` | MIT | 3.x |
| Video | `video.js` | Apache-2.0 | 8.x |
| MCP | `@modelcontextprotocol/sdk` | MIT | latest |
| AI SDK | `ai` (Vercel AI SDK) | Apache-2.0 | 3.x |
| State | `zustand` | MIT | 4.x |
| Process mgr | `supervisord` | MIT | 4.x |
| Proxy | `nginx` | BSD | 1.25.x |
| Container | Docker multi-stage | Apache-2.0 | 25.x |
| Export | `pandoc` (subprocess binary) | GPL-2+ binary* | 3.x |

> *Pandoc is invoked as an external subprocess via `child_process.exec`, not linked as a library. This does not trigger GPL copyleft on your application code.

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** Produce a Turborepo monorepo at `~/creator-os/` with a working Next.js app shell, shared packages, and CI-ready config.

***

### EPIC-01-A-01 — Assess Existing Environment

**Type:** Assess
**Description:** Verify the host machine has all required tooling before scaffolding begins. Missing tools must be installed before proceeding.
**Inputs:** Fresh machine or existing dev machine.
**Commands to run:**
```bash
node --version      # must be >= 20.0.0
pnpm --version      # must be >= 9.0.0
docker --version    # must be >= 25.0.0
git --version       # any recent version
```
**Outputs / Acceptance Criteria:**
- All four commands return version strings without error.
- If `pnpm` is missing: `npm install -g pnpm`
- If Node < 20: install via `nvm install 20 && nvm use 20`
- Document result in `SETUP_LOG.md` at repo root.

***

### EPIC-01-A-02 — Assess Monorepo Structure Requirements

**Type:** Assess
**Description:** Define the exact directory layout needed before creating any files. Output is a written directory tree in `ARCHITECTURE.md`.
**Inputs:** Tech stack table above.
**Outputs:** `ARCHITECTURE.md` containing:
```
creator-os/
├── apps/
│   └── web/                  # Next.js 14 main app
├── packages/
│   ├── ui/                   # shared shadcn components
│   ├── db/                   # Prisma schema + client
│   ├── mcp-server/           # MCP server package
│   └── mcp-client/           # MCP client + CLI
├── infra/
│   ├── nginx/                # nginx.conf
│   ├── supervisord/          # supervisord.conf
│   └── docker/               # Dockerfile + compose
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

***

### EPIC-01-P-01 — Plan Turborepo Pipeline Config

**Type:** Plan
**Description:** Define `turbo.json` pipeline tasks before scaffolding so every subsequent Execute ticket can rely on `pnpm turbo run build`, `dev`, `lint`, and `test`.
**Outputs:** Draft `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":   { "cache": false, "persistent": true },
    "lint":  { "outputs": [] },
    "test":  { "outputs": [] },
    "db:generate": { "cache": false }
  }
}
```

***

### EPIC-01-E-01 — Scaffold Turborepo Root

**Type:** Execute
**Description:** Initialize the monorepo root. Run exactly these commands in sequence.
**Commands:**
```bash
mkdir creator-os && cd creator-os
git init
pnpm init
pnpm add -D turbo typescript @types/node
```
**Files to create:**
- `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```
- `turbo.json`: use content from EPIC-01-P-01
- `.gitignore`: include `node_modules`, `.next`, `.turbo`, `dist`, `*.db`
- `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "target": "ES2022"
  }
}
```

***

### EPIC-01-E-02 — Scaffold Next.js App

**Type:** Execute
**Description:** Create the `apps/web` Next.js application with App Router, TypeScript, and Tailwind configured.
**Commands:**
```bash
cd apps
pnpm create next-app@14 web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```
**Post-scaffold edits:**
- In `apps/web/tsconfig.json`, add `"extends": "../../tsconfig.base.json"`
- In `apps/web/package.json`, set `"name": "@creator-os/web"`
- Delete `apps/web/public/vercel.svg` and `apps/web/public/next.svg`

***

### EPIC-01-E-03 — Install and Init shadcn/ui

**Type:** Execute
**Description:** Add the shared component library to `apps/web`.
**Commands (run from `apps/web`):**
```bash
pnpm dlx shadcn@latest init
# When prompted: style=default, base color=slate, CSS variables=yes
pnpm dlx shadcn@latest add button card input label textarea
pnpm dlx shadcn@latest add dropdown-menu navigation-menu sheet tabs
pnpm dlx shadcn@latest add toast sonner badge avatar separator
```

***

### EPIC-01-E-04 — Scaffold Shared Packages

**Type:** Execute
**Description:** Create the `packages/ui`, `packages/db`, `packages/mcp-server`, and `packages/mcp-client` directories with minimal `package.json` files so the workspace resolves them.
**Commands:**
```bash
mkdir -p packages/ui packages/db packages/mcp-server packages/mcp-client
```
For each package, create `package.json`:
```json
// packages/ui/package.json
{ "name": "@creator-os/ui", "version": "0.0.1", "main": "./index.ts", "types": "./index.ts" }

// packages/db/package.json
{ "name": "@creator-os/db", "version": "0.0.1", "main": "./index.ts" }

// packages/mcp-server/package.json
{ "name": "@creator-os/mcp-server", "version": "0.0.1", "main": "./src/index.ts" }

// packages/mcp-client/package.json
{ "name": "@creator-os/mcp-client", "version": "0.0.1", "main": "./src/index.ts", "bin": { "creator-cli": "./src/cli.ts" } }
```

***

### EPIC-01-V-01 — Validate Monorepo Boots

**Type:** Validate
**Pass criteria:**
```bash
cd creator-os
pnpm install          # exits 0, no unresolved workspace deps
pnpm turbo run build  # apps/web builds to .next without errors
pnpm turbo run dev    # Next.js dev server starts on http://localhost:3000
```
**Fail criteria:** Any non-zero exit code, TypeScript error, or missing package resolution. Fix before proceeding to EPIC-02.

***

## EPIC-02: Database Schema (Prisma + SQLite)

**Goal:** A fully migrated Prisma schema covering all content types: notes, posts, episodes, books, chapters, video assets, AI conversations, MCP configs, and automation triggers.

***

### EPIC-02-A-01 — Audit All Data Entities Across Modules

**Type:** Assess
**Description:** Before writing schema, enumerate every entity each module will need. Output is a plain list — one line per entity — written to `packages/db/ENTITIES.md`.
**Entity list (write exactly these):**
```
User, Session, Account (NextAuth)
Note (workspace notes)
NoteBlock (individual blocks within a note)
Post (newsletter/blog)
PostTag
Subscriber
Book
Chapter
Podcast (show-level config)
Episode (individual podcast episode)
VideoAsset
Playlist
AIConversation
AIMessage
MCPServerConfig
AutomationTrigger
AutomationLog
MediaFile (generic uploaded file)
Setting (key-value app config)
```

***

### EPIC-02-P-01 — Design Schema Relationships

**Type:** Plan
**Description:** Define foreign keys and cardinality before writing Prisma syntax. Write to `packages/db/SCHEMA_PLAN.md`:
- `User` 1→N `Note`, `Post`, `Book`, `Episode`, `AIConversation`
- `Book` 1→N `Chapter`
- `Podcast` 1→N `Episode`
- `Episode` 1→1 `MediaFile`
- `Post` N→N `PostTag` (via `_PostToTag` implicit join)
- `AIConversation` 1→N `AIMessage`
- `Note` 1→N `NoteBlock`
- All models have `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`

***

### EPIC-02-E-01 — Install Prisma and Write Schema

**Type:** Execute
**Commands (from `packages/db`):**
```bash
pnpm add prisma @prisma/client
pnpm prisma init --datasource-provider sqlite
```
**File: `packages/db/prisma/schema.prisma`** — write the full schema. Key models:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  notes         Note[]
  posts         Post[]
  books         Book[]
  conversations AIConversation[]
  accounts      Account[]
  sessions      Session[]
}

model Note {
  id        String      @id @default(cuid())
  title     String      @default("Untitled")
  content   String      @default("")  // TipTap JSON string
  icon      String?
  cover     String?
  parentId  String?
  parent    Note?       @relation("NoteChildren", fields: [parentId], references: [id])
  children  Note[]      @relation("NoteChildren")
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model Post {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
  content     String    @default("")
  excerpt     String?
  status      String    @default("draft") // draft | published | scheduled
  publishedAt DateTime?
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tags        PostTag[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model PostTag {
  id     String @id @default(cuid())
  name   String @unique
  posts  Post[]
}

model Subscriber {
  id         String   @id @default(cuid())
  email      String   @unique
  name       String?
  status     String   @default("active")
  source     String?
  createdAt  DateTime @default(now())
}

model Book {
  id          String    @id @default(cuid())
  title       String
  description String?
  coverImage  String?
  status      String    @default("draft")
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  chapters    Chapter[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Chapter {
  id        String   @id @default(cuid())
  title     String
  content   String   @default("")
  order     Int      @default(0)
  bookId    String
  book      Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Podcast {
  id          String    @id @default(cuid())
  title       String
  description String?
  author      String?
  coverImage  String?
  language    String    @default("en")
  category    String?
  episodes    Episode[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Episode {
  id          String     @id @default(cuid())
  title       String
  description String?
  content     String?
  duration    Int?       // seconds
  season      Int?
  episode     Int?
  status      String     @default("draft")
  publishedAt DateTime?
  mediaFile   MediaFile? @relation(fields: [mediaFileId], references: [id])
  mediaFileId String?    @unique
  podcastId   String
  podcast     Podcast    @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model MediaFile {
  id        String   @id @default(cuid())
  filename  String
  mimetype  String
  size      Int
  path      String
  url       String
  episode   Episode?
  createdAt DateTime @default(now())
}

model VideoAsset {
  id          String   @id @default(cuid())
  title       String
  description String?
  filename    String
  path        String
  url         String
  duration    Int?
  status      String   @default("processing")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AIConversation {
  id        String      @id @default(cuid())
  title     String      @default("New Conversation")
  model     String      @default("gpt-4o")
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  AIMessage[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model AIMessage {
  id             String         @id @default(cuid())
  role           String         // user | assistant | system | tool
  content        String
  toolCallId     String?
  conversationId String
  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  createdAt      DateTime       @default(now())
}

model MCPServerConfig {
  id        String   @id @default(cuid())
  name      String   @unique
  url       String
  transport String   @default("stdio") // stdio | sse | websocket
  command   String?
  args      String?  // JSON array string
  env       String?  // JSON object string
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AutomationTrigger {
  id        String           @id @default(cuid())
  name      String
  type      String           // webhook | schedule | event
  config    String           // JSON config string
  enabled   Boolean          @default(true)
  logs      AutomationLog[]
  createdAt DateTime         @default(now())
}

model AutomationLog {
  id          String            @id @default(cuid())
  status      String            // success | error | running
  input       String?
  output      String?
  error       String?
  triggerId   String
  trigger     AutomationTrigger @relation(fields: [triggerId], references: [id])
  createdAt   DateTime          @default(now())
}

model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value String
}

// NextAuth required models
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

***

### EPIC-02-E-02 — Create Prisma Client Export

**Type:** Execute
**File: `packages/db/index.ts`:**
```typescript
import { PrismaClient } from './generated/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query'] : [] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from './generated/client'
```
**File: `apps/web/.env.local`:**
```
DATABASE_URL="file:../../data/creator-os.db"
NEXTAUTH_SECRET="replace-with-32-char-random-string"
NEXTAUTH_URL="http://localhost:3000"
```

***

### EPIC-02-E-03 — Run Initial Migration

**Type:** Execute
**Commands (from `packages/db`):**
```bash
pnpm prisma generate
pnpm prisma migrate dev --name init
```
**Expected output:** `packages/db/prisma/migrations/YYYYMMDD_init/migration.sql` created. `packages/db/generated/client/` populated.

***

### EPIC-02-V-01 — Validate Schema and Client

**Type:** Validate
**Commands:**
```bash
pnpm prisma validate    # exits 0
pnpm prisma studio      # opens browser UI at http://localhost:5555
```
**Pass criteria:**
- `prisma validate` exits 0 with no errors
- Prisma Studio shows all models in sidebar: User, Note, Post, Book, Chapter, Podcast, Episode, MediaFile, VideoAsset, AIConversation, AIMessage, MCPServerConfig, AutomationTrigger, AutomationLog, Setting
- Insert one `Setting` row (`key="app_name"`, `value="Creator OS"`) via Studio; confirm it persists after Studio restart

***

## EPIC-03: Authentication Layer

**Goal:** Working NextAuth.js v5 session with credentials provider (email + password) and a protected route middleware.

***

### EPIC-03-A-01 — Assess Auth Requirements

**Type:** Assess
**Description:** Single-user app initially (solo creator). Confirm: email+password login only. No OAuth providers needed at MVP. Session stored in database via Prisma adapter. Cookie-based.
**Output:** Write `apps/web/AUTH_SPEC.md` with: provider=credentials, session=database, pages=custom `/login`.

***

### EPIC-03-E-01 — Install Auth Dependencies

**Type:** Execute
**Commands (from `apps/web`):**
```bash
pnpm add next-auth@beta @auth/prisma-adapter bcryptjs
pnpm add -D @types/bcryptjs
```

***

### EPIC-03-E-02 — Create Auth Config

**Type:** Execute
**File: `apps/web/src/lib/auth.ts`:**
```typescript
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@creator-os/db'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user || !user.hashedPassword) return null
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword as string
        )
        return valid ? user : null
      },
    }),
  ],
  pages: { signIn: '/login' },
})
```
**Also add `hashedPassword String?` field to the `User` model in `schema.prisma`, then re-run `pnpm prisma migrate dev --name add-password`.**

***

### EPIC-03-E-03 — Create Auth Route Handler and Middleware

**Type:** Execute
**File: `apps/web/src/app/api/auth/[...nextauth]/route.ts`:**
```typescript
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```
**File: `apps/web/src/middleware.ts`:**
```typescript
import { auth } from '@/lib/auth'
export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/login')
  if (!isLoggedIn && !isAuthPage) {
    return Response.redirect(new URL('/login', req.url))
  }
})
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] }
```
**File: `apps/web/src/app/login/page.tsx`:** Create a basic login form using shadcn `Card`, `Input`, `Button` components that `POST` to `/api/auth/callback/credentials`.

***

### EPIC-03-E-04 — Create Seed Script for Admin User

**Type:** Execute
**File: `packages/db/seed.ts`:**
```typescript
import { prisma } from './index'
import bcrypt from 'bcryptjs'

async function main() {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme', 12)
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@creator-os.local' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@creator-os.local',
      name: 'Admin',
      hashedPassword: hash,
    },
  })
  console.log('Seed complete')
}
main().catch(console.error).finally(() => prisma.$disconnect())
```
**Add to `packages/db/package.json`:** `"db:seed": "ts-node seed.ts"`

***

### EPIC-03-V-01 — Validate Auth Flow

**Type:** Validate
**Steps:**
1. Run `pnpm db:seed` → expect "Seed complete"
2. Start dev server, navigate to `http://localhost:3000/notes`
3. **Pass:** Redirect to `/login`
4. Log in with admin credentials
5. **Pass:** Redirect back to `/notes` without error
6. Navigate to `http://localhost:3000/api/auth/session`
7. **Pass:** Returns JSON with `user.email` populated

***

## EPIC-04: Shell UI & Navigation

**Goal:** A persistent sidebar navigation shell that renders all module routes, with a collapsible sidebar, dark/light mode, and breadcrumb header.

***

### EPIC-04-E-01 — Create App Layout with Sidebar

**Type:** Execute
**File: `apps/web/src/app/(app)/layout.tsx`** — this is the authenticated route group:
```typescript
import { Sidebar } from '@/components/shell/Sidebar'
import { Header } from '@/components/shell/Header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```
**File: `apps/web/src/components/shell/Sidebar.tsx`** — sidebar with nav links:
```typescript
// Nav items array:
const navItems = [
  { label: 'Notes',       href: '/notes',       icon: 'FileText' },
  { label: 'Publish',     href: '/publish',     icon: 'Send' },
  { label: 'Write',       href: '/write',       icon: 'BookOpen' },
  { label: 'Podcast',     href: '/podcast',     icon: 'Mic' },
  { label: 'Video',       href: '/video',       icon: 'Video' },
  { label: 'AI Chat',     href: '/ai',          icon: 'Bot' },
  { label: 'AI Agents',   href: '/agents',      icon: 'Workflow' },
  { label: 'Automate',    href: '/automate',    icon: 'Zap' },
  { label: 'MCP',         href: '/mcp',         icon: 'Server' },
  { label: 'Settings',    href: '/settings',    icon: 'Settings' },
]
// Render using Next.js <Link> and lucide-react icons
// Active state: compare pathname with href using usePathname()
```

***

### EPIC-04-E-02 — Create Stub Route Pages

**Type:** Execute
**Description:** Create an `page.tsx` stub for each module route so navigation doesn't 404 before module epics are built. Each stub renders an `<h1>` with the module name inside the app layout group.
**Files to create** (all inside `apps/web/src/app/(app)/`):
```
notes/page.tsx
publish/page.tsx
write/page.tsx
podcast/page.tsx
video/page.tsx
ai/page.tsx
agents/page.tsx
automate/page.tsx
mcp/page.tsx
settings/page.tsx
```
Each file:
```typescript
export default function NotesPage() {
  return <h1 className="text-2xl font-bold">Notes</h1>
}
```

***

### EPIC-04-V-01 — Validate Shell Navigation

**Type:** Validate
**Pass criteria:**
- All 10 nav links render without 404
- Active link is visually highlighted
- Sidebar collapses on mobile viewport (< 768px)
- No TypeScript errors (`pnpm tsc --noEmit` exits 0)

***

## EPIC-05: Notes & Workspace Module

**Goal:** A Notion-like notes module using TipTap + Novel. Supports nested notes (sidebar tree), block editing, auto-save, and emoji icons. Backed by the `Note` Prisma model.

***

### EPIC-05-A-01 — Assess Editor Requirements

**Type:** Assess
**Description:** Document exactly which TipTap extensions are needed. Write to `apps/web/src/app/(app)/notes/EDITOR_SPEC.md`:
- Block types: paragraph, heading (H1-H3), bullet list, ordered list, task list, blockquote, code block, horizontal rule, image
- Inline marks: bold, italic, underline, strikethrough, code, link
- Slash commands (via Novel's `Command` extension): `/h1`, `/h2`, `/bullet`, `/todo`, `/code`, `/quote`, `/image`
- Auto-save: debounce 1000ms on content change → `PATCH /api/notes/[id]`
- Storage format: TipTap JSON (stored as stringified JSON in `Note.content`)

***

### EPIC-05-E-01 — Install Editor Dependencies

**Type:** Execute
**Commands (from `apps/web`):**
```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
pnpm add @tiptap/extension-task-list @tiptap/extension-task-item
pnpm add @tiptap/extension-code-block-lowlight lowlight
pnpm add @tiptap/extension-image @tiptap/extension-link @tiptap/extension-underline
pnpm add @tiptap/extension-color @tiptap/extension-text-style
pnpm add novel
```

***

### EPIC-05-E-02 — Create Notes API Routes

**Type:** Execute
**Files to create** (all in `apps/web/src/app/api/notes/`):
- **`route.ts`** — `GET` returns all notes for current user (flat list with `parentId`); `POST` creates new note
- **`[id]/route.ts`** — `GET` returns single note; `PATCH` updates `title`/`content`; `DELETE` soft-deletes

Each handler pattern:
```typescript
import { auth } from '@/lib/auth'
import { prisma } from '@creator-os/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notes = await prisma.note.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, icon: true, parentId: true, updatedAt: true }
  })
  return NextResponse.json(notes)
}
```

***

### EPIC-05-E-03 — Build Notes Sidebar Tree

**Type:** Execute
**File: `apps/web/src/components/notes/NoteTree.tsx`**
- Fetch notes from `GET /api/notes`
- Build nested tree: group by `parentId`, render recursively
- Each node: clickable (navigates to `/notes/[id]`), right-click context menu with "Rename", "Delete", "Add child"
- "New note" button at top creates a root note via `POST /api/notes` and navigates to it

***

### EPIC-05-E-04 — Build Note Editor Page

**Type:** Execute
**File: `apps/web/src/app/(app)/notes/[id]/page.tsx`:**
- Fetch note by ID from `GET /api/notes/[id]`
- Render editable title (`<input>` auto-resizes)
- Render `<TipTapEditor>` component (see below)
- Auto-save: `useEffect` with `debounce(save, 1000)` on content/title change

**File: `apps/web/src/components/notes/TipTapEditor.tsx`:**
```typescript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
// ... other imports

const lowlight = createLowlight(common)

export function TipTapEditor({ content, onChange }: { content: string; onChange: (json: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      // ... other extensions
    ],
    content: content ? JSON.parse(content) : undefined,
    onUpdate: ({ editor }) => onChange(JSON.stringify(editor.getJSON())),
  })
  return <EditorContent editor={editor} className="prose prose-sm max-w-none dark:prose-invert min-h-[calc(100vh-200px)] focus:outline-none" />
}
```

***

### EPIC-05-V-01 — Validate Notes Module

**Type:** Validate
**Pass criteria:**
- Create a note → appears in sidebar tree immediately
- Type in editor → auto-saves (verify `updatedAt` changes in DB via Prisma Studio)
- Create child note → appears nested under parent in tree
- Slash command `/h1` inserts H1 block
- Refresh page → content persists exactly
- Delete note → removed from sidebar

***

## EPIC-06: Publishing & Newsletter Module

**Goal:** Ghost-inspired publishing module for writing, managing, and "sending" posts. Uses TipTap as the editor. Posts have draft/published/scheduled status. Subscriber list management. RSS feed auto-generation.

***

### EPIC-06-E-01 — Install Publishing Dependencies

**Type:** Execute
**Commands:**
```bash
pnpm add @tiptap/extension-bubble-menu @tiptap/extension-floating-menu
pnpm add slugify feed  # feed = RSS/Atom generation, MIT license
pnpm add nodemailer    # for email sending
pnpm add -D @types/nodemailer
```

***

### EPIC-06-E-02 — Create Posts API Routes

**Type:** Execute
**Routes to build** (in `apps/web/src/app/api/posts/`):
- `GET /api/posts` — list all posts with pagination (`?page=1&limit=20&status=draft`)
- `POST /api/posts` — create post (auto-generate slug from title via `slugify`)
- `GET /api/posts/[id]` — get single post
- `PATCH /api/posts/[id]` — update post fields
- `DELETE /api/posts/[id]` — delete
- `POST /api/posts/[id]/publish` — set status=published, set publishedAt=now()

***

### EPIC-06-E-03 — Build RSS Feed Route

**Type:** Execute
**File: `apps/web/src/app/rss.xml/route.ts`:**
```typescript
import { prisma } from '@creator-os/db'
import { Feed } from 'feed'

export async function GET() {
  const setting = await prisma.setting.findUnique({ where: { key: 'app_name' } })
  const posts = await prisma.post.findMany({
    where: { status: 'published' },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  })
  const feed = new Feed({
    title: setting?.value || 'Creator OS Blog',
    id: process.env.NEXTAUTH_URL!,
    link: process.env.NEXTAUTH_URL!,
    copyright: new Date().getFullYear().toString(),
  })
  posts.forEach((p) => feed.addItem({
    title: p.title,
    id: `${process.env.NEXTAUTH_URL}/posts/${p.slug}`,
    link: `${process.env.NEXTAUTH_URL}/posts/${p.slug}`,
    description: p.excerpt || '',
    date: p.publishedAt || p.createdAt,
  }))
  return new Response(feed.rss2(), { headers: { 'Content-Type': 'application/rss+xml' } })
}
```

***

### EPIC-06-E-04 — Build Post Editor UI

**Type:** Execute
**File: `apps/web/src/app/(app)/publish/[id]/page.tsx`:**
- Toolbar: title input, tag selector, status badge, "Publish" button, "Schedule" button
- Editor: reuse `TipTapEditor` component from EPIC-05-E-04 with BubbleMenu for inline formatting
- Sidebar panel (right): SEO meta (title, description), featured image upload, publish date picker
- Auto-save same pattern as Notes module (debounce 1000ms)

***

### EPIC-06-E-05 — Build Subscriber Management UI

**Type:** Execute
**File: `apps/web/src/app/(app)/publish/subscribers/page.tsx`:**
- Table: email, name, status, source, createdAt using shadcn `Table` component
- Import CSV button → parse CSV → batch `POST /api/subscribers`
- Export CSV button → `GET /api/subscribers?format=csv`
- Subscriber count card at top

***

### EPIC-06-V-01 — Validate Publishing Module

**Type:** Validate
**Pass criteria:**
- Create post, publish → status changes to "published"
- Navigate to `/rss.xml` → valid RSS document with post item
- Import 3 subscribers via CSV → all appear in table
- Post slug is unique and URL-safe (test with title containing spaces and special characters)

***

## EPIC-07: Book Writing Module

**Goal:** Chapter-based long-form writing with a two-panel layout (chapter tree left, TipTap editor right), word count tracking, and export to DOCX/PDF/ePub via Pandoc.

***

### EPIC-07-E-01 — Install Export Dependencies

**Type:** Execute
**Commands:**
```bash
pnpm add archiver     # zip multiple files for export
# Pandoc is invoked as a system binary — installed in Docker image, not npm
```
**Verify Pandoc is available:**
```bash
pandoc --version   # must return >= 3.0
```

***

### EPIC-07-E-02 — Create Books and Chapters API Routes

**Type:** Execute
**Routes:**
- `GET /api/books` — list user's books
- `POST /api/books` — create book
- `GET /api/books/[id]` — get book with chapters (ordered by `order`)
- `PATCH /api/books/[id]` — update book metadata
- `GET /api/books/[id]/chapters` — list chapters
- `POST /api/books/[id]/chapters` — add chapter
- `PATCH /api/books/[id]/chapters/[cid]` — update chapter content/title/order
- `DELETE /api/books/[id]/chapters/[cid]` — delete chapter

***

### EPIC-07-E-03 — Build Book Editor UI

**Type:** Execute
**File: `apps/web/src/app/(app)/write/[bookId]/page.tsx`:**
- Left panel (240px): book title + chapter list (draggable for reorder using `@dnd-kit/core`)
- Right panel: chapter title input + TipTap editor (same component from EPIC-05)
- Word count: derive from `editor.getText().split(/\s+/).filter(Boolean).length`
- Reading time estimate: `Math.ceil(wordCount / 238)` minutes

**Install drag-and-drop:**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

***

### EPIC-07-E-04 — Build Pandoc Export API Route

**Type:** Execute
**File: `apps/web/src/app/api/books/[id]/export/route.ts`:**
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@creator-os/db'

const execAsync = promisify(exec)

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { format } = await req.json() // 'docx' | 'pdf' | 'epub'
  const book = await prisma.book.findUnique({
    where: { id: params.id },
    include: { chapters: { orderBy: { order: 'asc' } } },
  })
  if (!book) return new Response('Not found', { status: 404 })

  // Convert TipTap JSON to Markdown for each chapter
  // Use tiptap-markdown extension or manual recursive walk
  const markdown = book.chapters.map(c => 
    `# ${c.title}\n\n${tiptapJsonToMarkdown(c.content)}`
  ).join('\n\n---\n\n')

  const tmpDir = `/tmp/export-${book.id}`
  await mkdir(tmpDir, { recursive: true })
  const mdPath = path.join(tmpDir, 'book.md')
  const outPath = path.join(tmpDir, `book.${format}`)
  await writeFile(mdPath, markdown)

  await execAsync(`pandoc "${mdPath}" -o "${outPath}" --standalone`)

  const buffer = await readFile(outPath)
  await unlink(mdPath); await unlink(outPath)

  const mimeTypes: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
  }
  return new Response(buffer, {
    headers: {
      'Content-Type': mimeTypes[format],
      'Content-Disposition': `attachment; filename="${book.title}.${format}"`,
    },
  })
}
```
**Note:** `tiptapJsonToMarkdown` is a recursive function that walks TipTap's JSON AST. Write as a pure utility in `apps/web/src/lib/tiptap-to-md.ts`. Supported nodes: paragraph, heading, bulletList, orderedList, listItem, taskList, taskItem, codeBlock, blockquote, hardBreak, horizontalRule. Inline marks: bold, italic, code, link, strikethrough.

***

### EPIC-07-V-01 — Validate Book Writing Module

**Type:** Validate
**Pass criteria:**
- Create book → create 3 chapters → reorder via drag → order persists after refresh
- Write content in chapter → word count updates live
- Export to DOCX → file downloads and opens in LibreOffice/Word with correct chapter headings
- Export to ePub → file validates with `epubcheck` (or opens in Calibre)

***

## EPIC-08: Podcast Module

**Goal:** Upload audio files, manage episode metadata, auto-generate a Podcasting-2.0-compliant RSS feed, and play back episodes in a Plyr audio player. Backed by `Podcast` and `Episode` Prisma models.

***

### EPIC-08-E-01 — Install Audio Player and Upload Dependencies

**Type:** Execute
**Commands:**
```bash
pnpm add plyr react-plyr
pnpm add formidable       # multipart file parsing
pnpm add music-metadata   # extract duration from audio files, MIT license
pnpm add -D @types/formidable
```

***

### EPIC-08-E-02 — Create File Upload API Route

**Type:** Execute
**File: `apps/web/src/app/api/upload/route.ts`:**
- Accept `multipart/form-data` with `file` field
- Save to `/data/media/[cuid].[ext]`
- Extract duration via `music-metadata.parseBuffer()`
- Create `MediaFile` record in DB
- Return `{ id, url, duration, filename }`
- Enforce: only `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav` MIME types allowed
- Max file size: 500MB (configurable via `Setting` key `max_upload_mb`)

***

### EPIC-08-E-03 — Create Podcast and Episode API Routes

**Type:** Execute
**Routes:**
- `GET /api/podcast` — get podcast config (single show)
- `PUT /api/podcast` — upsert show metadata
- `GET /api/episodes` — list episodes with pagination
- `POST /api/episodes` — create episode
- `PATCH /api/episodes/[id]` — update episode (title, description, content, status)
- `DELETE /api/episodes/[id]` — delete episode + associated MediaFile
- `POST /api/episodes/[id]/publish` — set status=published, publishedAt=now()

***

### EPIC-08-E-04 — Build Podcast RSS Feed Route

**Type:** Execute
**File: `apps/web/src/app/podcast.xml/route.ts`:**
Generate a Podcasting 2.0 compliant RSS feed. Required elements:
```xml
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podcast="https://podcastindex.org/namespace/1.0">
  hannel>
    <title>{{podcast.title}}</title>
    <description>{{podcast.description}}</description>
    <itunes:author>{{podcast.author}}</itunes:author>
    <itunes:image href="{{podcast.coverImage}}" />
    anguage>{{podcast.language}}</language>
    <itunes:category text="{{podcast.category}}" />
    <!-- For each published episode: -->
    <item>
      <title>{{episode.title}}</title>
      <description>{{episode.description}}</description>
      <enclosure url="{{episode.mediaFile.url}}" length="{{mediaFile.size}}" type="{{mediaFile.mimetype}}" />
      <itunes:duration>{{episode.duration}}</itunes:duration>
      <pubDate>{{episode.publishedAt}}</pubDate>
      <guid isPermaLink="false">{{episode.id}}</guid>
    </item>
  </channel>
</rss>
```

***

### EPIC-08-E-05 — Build Podcast UI

**Type:** Execute
**File: `apps/web/src/app/(app)/podcast/page.tsx`:**
- Header: show artwork, title, subscriber/download count
- Episode list: table with title, date, duration, status badge, action menu
- "New Episode" button → opens drawer with: title, description (TipTap mini), audio upload (drag-drop), season/episode number, publish date
**File: `apps/web/src/app/(app)/podcast/[id]/page.tsx`** — episode detail with Plyr audio player:
```typescript
'use client'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
// Initialize Plyr on <audio> element via useEffect
```

***

### EPIC-08-V-01 — Validate Podcast Module

**Type:** Validate
**Pass criteria:**
- Upload a 5MB MP3 → file saved to `/data/media/`, `MediaFile` row created, duration extracted
- Create episode linked to uploaded audio → publish → appears in `/podcast.xml`
- Validate RSS at `https://validator.w3.org/feed/` → no errors
- Plyr player plays audio on episode detail page
- `Content-Type: application/rss+xml` header present on `/podcast.xml`

***

## EPIC-09: Video Module

**Goal:** Upload and serve video files via HLS (HTTP Live Streaming) for on-demand playback, and integrate Owncast as a co-process for live streaming. Video.js player embedded in the UI.

***

### EPIC-09-A-01 — Assess Owncast Integration Approach

**Type:** Assess
**Description:** Owncast runs on port `8080` inside the container. The Next.js app embeds its stream player via an `<iframe>` pointing to `http://localhost:8080` (or via the video.js HLS endpoint Owncast exposes at `http://localhost:8080/hls/stream.m3u8`). Owncast admin UI is available at `http://localhost:8080/admin`. The Next.js app does NOT clone or modify Owncast source — it consumes its HTTP API and HLS stream.
**Output:** Write `apps/web/src/app/(app)/video/OWNCAST_SPEC.md` confirming this approach.

***

### EPIC-09-E-01 — Install Video Dependencies

**Type:** Execute
**Commands:**
```bash
pnpm add video.js
pnpm add -D @types/video.js
# ffmpeg is a system binary installed in Docker image, not npm
```

***

### EPIC-09-E-02 — Create Video Upload and HLS Transcoding API

**Type:** Execute
**File: `apps/web/src/app/api/videos/route.ts`** — POST handler:
1. Accept video file upload (same pattern as EPIC-08-E-02)
2. Save raw file to `/data/videos/raw/[id].[ext]`
3. Trigger background HLS transcode:
```typescript
const cmd = `ffmpeg -i "${inputPath}" \
  -profile:v baseline -level 3.0 \
  -start_number 0 -hls_time 10 -hls_list_size 0 \
  -f hls "/data/videos/hls/${id}/index.m3u8"`
execAsync(cmd) // fire-and-forget, update status async
```
4. Set `VideoAsset.status = "processing"`, return immediately
5. After ffmpeg completes, update `VideoAsset.status = "ready"`, set `VideoAsset.url = "/media/videos/hls/[id]/index.m3u8"`

***

### EPIC-09-E-03 — Serve HLS Segments and Build Video Player

**Type:** Execute
**File: `apps/web/src/app/media/videos/[...path]/route.ts`** — serve HLS files from `/data/videos/hls/`:
```typescript
import { readFile } from 'fs/promises'
import path from 'path'
export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const filePath = path.join('/data/videos/hls', ...params.path)
  const buffer = await readFile(filePath)
  const ext = params.path.at(-1)?.split('.').pop()
  const mimeTypes: Record<string, string> = { m3u8: 'application/vnd.apple.mpegurl', ts: 'video/MP2T' }
  return new Response(buffer, { headers: { 'Content-Type': mimeTypes[ext!] || 'application/octet-stream' } })
}
```
**File: `apps/web/src/components/video/VideoPlayer.tsx`:**
```typescript
'use client'
import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

export function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!videoRef.current) return
    const player = videojs(videoRef.current, { controls: true, fluid: true,
      sources: [{ src, type: 'application/vnd.apple.mpegurl' }]
    })
    return () => player.dispose()
  }, [src])
  return <div data-vjs-player><video ref={videoRef} className="video-js vjs-big-play-centered" /></div>
}
```

***

### EPIC-09-E-04 — Build Live Stream Dashboard

**Type:** Execute
**File: `apps/web/src/app/(app)/video/live/page.tsx`:**
- Embed live stream player using `VideoPlayer` component with `src="http://localhost:8080/hls/stream.m3u8"`
- Show Owncast stream status via `fetch('http://localhost:8080/api/status')`
- Link to Owncast admin: opens `http://localhost:8080/admin` in new tab
- Display stream key and RTMP endpoint from Owncast API for OBS config

***

### EPIC-09-V-01 — Validate Video Module

**Type:** Validate
**Pass criteria:**
- Upload a 30-second MP4 → `VideoAsset.status` transitions processing → ready
- `/media/videos/hls/[id]/index.m3u8` returns 200 with correct MIME type
- VideoPlayer component renders and plays the HLS stream without buffering errors in Chrome
- Owncast live player renders (may show "no stream" if not actively streaming — that is acceptable)

***

## EPIC-10: AI Chat Module

**Goal:** A full-featured AI chat interface backed by the Vercel AI SDK. Supports streaming responses, multiple conversations, model selection (OpenAI / Anthropic / Ollama), file attachments for RAG context, and system prompt management.

***

### EPIC-10-E-01 — Install AI Dependencies

**Type:** Execute
**Commands:**
```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic ollama-ai-provider
pnpm add @ai-sdk/react
```

***

### EPIC-10-E-02 — Create AI Chat API Route

**Type:** Execute
**File: `apps/web/src/app/api/ai/chat/route.ts`:**
```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import { prisma } from '@creator-os/db'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })
  
  const { messages, conversationId, model = 'gpt-4o', systemPrompt } = await req.json()
  
  const modelMap: Record<string, any> = {
    'gpt-4o': openai('gpt-4o'),
    'gpt-4o-mini': openai('gpt-4o-mini'),
    'claude-3-5-sonnet': anthropic('claude-3-5-sonnet-20241022'),
    'claude-3-haiku': anthropic('claude-3-haiku-20240307'),
  }
  
  // Ollama models (local): prefix with 'ollama/'
  if (model.startsWith('ollama/')) {
    const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' })
    modelMap[model] = ollama(model.replace('ollama/', ''))
  }
  
  const result = await streamText({
    model: modelMap[model] || openai('gpt-4o'),
    messages,
    system: systemPrompt || 'You are a helpful assistant for a cybersecurity content creator.',
    onFinish: async ({ text }) => {
      if (conversationId) {
        await prisma.aIMessage.create({
          data: { conversationId, role: 'assistant', content: text }
        })
      }
    }
  })
  
  return result.toDataStreamResponse()
}
```

***

### EPIC-10-E-03 — Build Chat UI

**Type:** Execute
**File: `apps/web/src/app/(app)/ai/page.tsx`:**
Uses `useChat` hook from `@ai-sdk/react`:
```typescript
'use client'
import { useChat } from '@ai-sdk/react'
// Panels: left = conversation list, right = messages + input
// Message bubbles: user (right-aligned), assistant (left-aligned, supports markdown)
// Model selector: shadcn Select with grouped options (OpenAI, Anthropic, Local/Ollama)
// System prompt: collapsible panel above messages
// Input: shadcn Textarea with Cmd+Enter send, paperclip for file attach
```
Install markdown renderer for AI responses:
```bash
pnpm add react-markdown remark-gfm rehype-highlight
```

***

### EPIC-10-E-04 — Build Conversations API

**Type:** Execute
**Routes:**
- `GET /api/ai/conversations` — list user's conversations (id, title, model, updatedAt)
- `POST /api/ai/conversations` — create new conversation
- `GET /api/ai/conversations/[id]/messages` — load full message history
- `PATCH /api/ai/conversations/[id]` — update title
- `DELETE /api/ai/conversations/[id]` — delete conversation + messages

***

### EPIC-10-V-01 — Validate AI Chat Module

**Type:** Validate
**Pass criteria:**
- Send message → streaming response appears token-by-token
- Switch model to `claude-3-haiku` mid-session → new messages use Haiku
- Messages persist after page refresh (loaded from DB)
- Code blocks in AI response render with syntax highlighting
- If OPENAI_API_KEY is missing: renders clear error toast, not a crash

***

## EPIC-11: AI Agent Builder (Flowise Integration)

**Goal:** Embed Flowise as a co-process inside the container. Expose Flowise's UI at `/agents` route via an iframe proxy. Provide API routes in Next.js that call Flowise chatflows programmatically from other modules (e.g., "Generate newsletter from notes").

***

### EPIC-11-A-01 — Assess Flowise Embedding Strategy

**Type:** Assess
**Description:** Flowise runs as a standalone Node.js server on port `3100` inside the container. The Next.js app embeds Flowise in two ways: (1) the visual agent builder UI is embedded via `<iframe src="http://localhost:3100">` at `/agents`; (2) programmatic calls to Flowise chatflows from Next.js API routes use Flowise's REST API (`POST /api/v1/prediction/[chatflowId]`). Flowise is NOT forked — it runs unmodified as a co-process.

***

### EPIC-11-E-01 — Create Flowise Proxy Route

**Type:** Execute
**File: `apps/web/src/app/(app)/agents/page.tsx`:**
```typescript
export default function AgentsPage() {
  return (
    <iframe
      src="http://localhost:3100"
      className="w-full h-[calc(100vh-120px)] border-0 rounded-lg"
      title="AI Agent Builder"
    />
  )
}
```

***

### EPIC-11-E-02 — Create Flowise API Bridge Routes

**Type:** Execute
**File: `apps/web/src/app/api/agents/chatflows/route.ts`:**
```typescript
export async function GET() {
  const res = await fetch('http://localhost:3100/api/v1/chatflows', {
    headers: { Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` }
  })
  return Response.json(await res.json())
}
```
**File: `apps/web/src/app/api/agents/run/route.ts`:**
```typescript
export async function POST(req: Request) {
  const { chatflowId, question, context } = await req.json()
  const res = await fetch(`http://localhost:3100/api/v1/prediction/${chatflowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` },
    body: JSON.stringify({ question, overrideConfig: { context } })
  })
  return Response.json(await res.json())
}
```

***

### EPIC-11-E-03 — Add "AI Assist" Buttons to Content Modules

**Type:** Execute
**Description:** Add a contextual "AI Assist" dropdown to the Notes editor toolbar and Post editor toolbar. Each option calls `/api/agents/run` with a pre-built chatflowId:
- "Expand this section" → calls the `expand-content` chatflow
- "Generate summary" → calls `summarize` chatflow
- "Suggest SEO title" → calls `seo-title` chatflow
- "Draft from outline" → calls `draft-from-outline` chatflow

**File: `apps/web/src/components/editor/AIAssistMenu.tsx`** — a dropdown using shadcn `DropdownMenu` that calls `/api/agents/run`, then inserts the response at the current cursor position via `editor.commands.insertContent()`.

***

### EPIC-11-V-01 — Validate Flowise Integration

**Type:** Validate
**Pass criteria:**
- `/agents` route loads Flowise UI in iframe without CORS errors
- `GET /api/agents/chatflows` returns list of chatflows from Flowise
- "AI Assist → Generate summary" in notes editor inserts text at cursor
- Flowise co-process remains running after 1 hour idle (check supervisord logs)

***

## EPIC-12: Automation Module (Activepieces Integration)

**Goal:** Embed Activepieces as a co-process on port `8200`. Expose its UI at `/automate`. Add webhook trigger routes in Next.js that Activepieces flows can call to create content (e.g., "On new YouTube video → create episode draft").

***

### EPIC-12-E-01 — Embed Activepieces UI

**Type:** Execute
**File: `apps/web/src/app/(app)/automate/page.tsx`:**
```typescript
export default function AutomatePage() {
  return (
    <iframe
      src="http://localhost:8200"
      className="w-full h-[calc(100vh-120px)] border-0 rounded-lg"
      title="Automation Builder"
    />
  )
}
```

***

### EPIC-12-E-02 — Create Inbound Webhook Routes for Automation

**Type:** Execute
**Description:** Activepieces flows call these webhook routes to trigger actions inside Creator OS.
**File: `apps/web/src/app/api/webhooks/create-note/route.ts`:**
```typescript
export async function POST(req: Request) {
  const { title, content, secret } = await req.json()
  if (secret !== process.env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 })
  const setting = await prisma.setting.findUnique({ where: { key: 'default_user_id' } })
  const note = await prisma.note.create({
    data: { title, content: content || '', userId: setting!.value }
  })
  return Response.json({ id: note.id })
}
```
**Create similar routes for:** `create-episode-draft`, `create-post-draft`, `log-automation-event`

***

### EPIC-12-V-01 — Validate Automation Module

**Type:** Validate
**Pass criteria:**
- `/automate` renders Activepieces UI in iframe
- Manually `POST` to `/api/webhooks/create-note` with correct secret → note appears in Notes module
- Activepieces flow "HTTP Request → Creator OS webhook" succeeds without 4xx/5xx errors

***

## EPIC-13: MCP Server

**Goal:** A fully functional MCP (Model Context Protocol) server in `packages/mcp-server` that exposes Creator OS data and actions as MCP Tools and Resources. Compatible with Claude Desktop, Cursor, Windsurf, and any MCP client.

***

### EPIC-13-A-01 — Audit All MCP Tools Needed

**Type:** Assess
**Description:** Define every tool the MCP server will expose. Write to `packages/mcp-server/TOOLS_SPEC.md`:
```
RESOURCES (read-only):
  - creator://notes          → list all notes
  - creator://notes/{id}     → get note content
  - creator://posts          → list all posts
  - creator://books          → list all books
  - creator://episodes       → list podcast episodes
  - creator://subscribers    → subscriber count + list

TOOLS (actions):
  - create_note(title, content?)        → creates a note, returns id
  - update_note(id, title?, content?)   → updates note
  - search_notes(query)                 → full-text search across notes
  - create_post(title, content?, tags?) → creates draft post
  - publish_post(id)                    → publishes post
  - create_episode(title, podcastId)    → creates episode draft
  - create_book_chapter(bookId, title)  → adds chapter to book
  - search_content(query)               → searches notes + posts + chapters
  - get_rss_url()                       → returns podcast and blog RSS URLs
  - run_ai_agent(chatflowId, prompt)    → runs a Flowise chatflow
  - trigger_automation(name, payload)   → triggers Activepieces webhook
```

***

### EPIC-13-E-01 — Install MCP Server Dependencies

**Type:** Execute
**Commands (from `packages/mcp-server`):**
```bash
pnpm add @modelcontextprotocol/sdk zod
pnpm add @creator-os/db
```

***

### EPIC-13-E-02 — Implement MCP Server Core

**Type:** Execute
**File: `packages/mcp-server/src/index.ts`:**
```typescript
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { prisma } from '@creator-os/db'

const server = new McpServer({
  name: 'creator-os',
  version: '1.0.0',
})

// ─── Resources ────────────────────────────────────────────
server.resource('creator://notes', 'List all notes', async () => {
  const notes = await prisma.note.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })
  return { contents: [{ uri: 'creator://notes', text: JSON.stringify(notes, null, 2) }] }
})

server.resource(
  new ResourceTemplate('creator://notes/{id}', { list: undefined }),
  'Get note content by ID',
  async (uri, { id }) => {
    const note = await prisma.note.findUnique({ where: { id: String(id) } })
    if (!note) return { contents: [{ uri, text: 'Note not found' }] }
    return { contents: [{ uri, text: `# ${note.title}\n\n${note.content}` }] }
  }
)

// ─── Tools ────────────────────────────────────────────────
server.tool(
  'create_note',
  { title: z.string(), content: z.string().optional() },
  async ({ title, content }) => {
    const setting = await prisma.setting.findUnique({ where: { key: 'default_user_id' } })
    const note = await prisma.note.create({
      data: { title, content: content || '', userId: setting!.value }
    })
    return { content: [{ type: 'text', text: `Created note "${title}" with id: ${note.id}` }] }
  }
)

server.tool(
  'search_content',
  { query: z.string() },
  async ({ query }) => {
    const q = query.toLowerCase()
    const [notes, posts, chapters] = await Promise.all([
      prisma.note.findMany({ where: { OR: [{ title: { contains: q } }, { content: { contains: q } }] }, take: 5 }),
      prisma.post.findMany({ where: { OR: [{ title: { contains: q } }, { content: { contains: q } }] }, take: 5 }),
      prisma.chapter.findMany({ where: { OR: [{ title: { contains: q } }, { content: { contains: q } }] }, take: 5 }),
    ])
    const results = [
      ...notes.map(n => ({ type: 'note', id: n.id, title: n.title })),
      ...posts.map(p => ({ type: 'post', id: p.id, title: p.title })),
      ...chapters.map(c => ({ type: 'chapter', id: c.id, title: c.title })),
    ]
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
  }
)

server.tool(
  'create_post',
  { title: z.string(), content: z.string().optional(), tags: z.array(z.string()).optional() },
  async ({ title, content, tags }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const setting = await prisma.setting.findUnique({ where: { key: 'default_user_id' } })
    const post = await prisma.post.create({
      data: {
        title, content: content || '', slug: `${slug}-${Date.now()}`,
        userId: setting!.value,
        tags: tags?.length ? { connectOrCreate: tags.map(t => ({ where: { name: t }, create: { name: t } })) } : undefined,
      }
    })
    return { content: [{ type: 'text', text: `Created post "${title}" (id: ${post.id}, slug: ${post.slug})` }] }
  }
)

server.tool(
  'publish_post',
  { id: z.string() },
  async ({ id }) => {
    await prisma.post.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } })
    return { content: [{ type: 'text', text: `Published post ${id}` }] }
  }
)

server.tool(
  'create_episode',
  { title: z.string(), podcastId: z.string() },
  async ({ title, podcastId }) => {
    const ep = await prisma.episode.create({ data: { title, podcastId } })
    return { content: [{ type: 'text', text: `Created episode "${title}" (id: ${ep.id})` }] }
  }
)

server.tool(
  'run_ai_agent',
  { chatflowId: z.string(), prompt: z.string() },
  async ({ chatflowId, prompt }) => {
    const res = await fetch(`http://localhost:3100/api/v1/prediction/${chatflowId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: prompt }),
    })
    const data = await res.json()
    return { content: [{ type: 'text', text: data.text || JSON.stringify(data) }] }
  }
)

// ─── Start ────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Creator OS MCP Server running on stdio')
```

***

### EPIC-13-E-03 — Add SSE Transport Option

**Type:** Execute
**Description:** The stdio transport is used by Claude Desktop. Add an SSE (Server-Sent Events) transport option so web-based MCP clients and the in-app MCP client (EPIC-14) can connect over HTTP.

**File: `packages/mcp-server/src/sse-server.ts`:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'
import { registerAllTools } from './tools.js'  // extract tools to a shared module

const app = express()
const server = new McpServer({ name: 'creator-os', version: '1.0.0' })
registerAllTools(server)

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  await server.connect(transport)
})
app.post('/messages', express.json(), async (req, res) => {
  // handle MCP messages
})
app.listen(3200, () => console.log('MCP SSE server on :3200'))
```
**Refactor:** Extract all tool/resource registrations from `index.ts` into `packages/mcp-server/src/tools.ts` so both stdio and SSE transports share the same tool definitions.

***

### EPIC-13-E-04 — Add MCP Config UI Page

**Type:** Execute
**File: `apps/web/src/app/(app)/mcp/page.tsx`:**
- Section 1: "This Server" — display stdio command for Claude Desktop config:
```json
{
  "mcpServers": {
    "creator-os": {
      "command": "node",
      "args": ["/app/packages/mcp-server/dist/index.js"]
    }
  }
}
```
- Show SSE endpoint: `http://localhost:3200/sse`
- Copy-to-clipboard button for both configs
- Section 2: "Connected External Servers" — list from `MCPServerConfig` DB table (populated in EPIC-14)

***

### EPIC-13-V-01 — Validate MCP Server (stdio)

**Type:** Validate
**Commands:**
```bash
# Build the server
cd packages/mcp-server && pnpm build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```
**Pass criteria in MCP Inspector:**
- All listed tools appear in "Tools" tab
- `create_note` tool executes successfully: input `{ "title": "Test MCP Note" }` → returns id, note appears in DB
- `search_content` tool returns results when DB has content
- All resources (`creator://notes`, `creator://posts`) return valid JSON

***

## EPIC-14: MCP Client & CLI

**Goal:** A `packages/mcp-client` package that (1) connects to multiple MCP servers (internal SSE + external), (2) provides an `McpClient` class usable from Next.js API routes, and (3) exports a `creator-cli` binary for terminal-driven content management.

***

### EPIC-14-E-01 — Install MCP Client Dependencies

**Type:** Execute
**Commands (from `packages/mcp-client`):**
```bash
pnpm add @modelcontextprotocol/sdk zod commander chalk ora
pnpm add -D tsx @types/node
```

***

### EPIC-14-E-02 — Implement MCP Client Class

**Type:** Execute
**File: `packages/mcp-client/src/McpClient.ts`:**
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface ServerConfig {
  name: string
  transport: 'sse' | 'stdio'
  url?: string          // for SSE
  command?: string      // for stdio
  args?: string[]
}

export class McpClient {
  private clients: Map<string, Client> = new Map()

  async connect(config: ServerConfig): Promise<void> {
    const client = new Client({ name: 'creator-os-client', version: '1.0.0' })
    let transport
    if (config.transport === 'sse') {
      transport = new SSEClientTransport(new URL(config.url!))
    } else {
      transport = new StdioClientTransport({ command: config.command!, args: config.args })
    }
    await client.connect(transport)
    this.clients.set(config.name, client)
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>) {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`Server "${serverName}" not connected`)
    return client.callTool({ name: toolName, arguments: args })
  }

  async listTools(serverName: string) {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`Server "${serverName}" not connected`)
    return client.listTools()
  }

  async readResource(serverName: string, uri: string) {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`Server "${serverName}" not connected`)
    return client.readResource({ uri })
  }

  async disconnectAll() {
    for (const client of this.clients.values()) await client.close()
    this.clients.clear()
  }
}
```

***

### EPIC-14-E-03 — Build MCP Client Manager API Route

**Type:** Execute
**Description:** The Next.js app uses the MCP Client to connect to external MCP servers configured in the DB (e.g., Brave Search MCP, Filesystem MCP, GitHub MCP). The client is initialized on server startup and shared as a singleton.

**File: `apps/web/src/lib/mcpClientManager.ts`:**
```typescript
import { McpClient } from '@creator-os/mcp-client'
import { prisma } from '@creator-os/db'

const globalForMcp = globalThis as unknown as { mcpClient: McpClient }
export const mcpClient = globalForMcp.mcpClient ?? new McpClient()
if (process.env.NODE_ENV !== 'production') globalForMcp.mcpClient = mcpClient

export async function initMcpConnections() {
  const configs = await prisma.mCPServerConfig.findMany({ where: { enabled: true } })
  for (const cfg of configs) {
    try {
      await mcpClient.connect({
        name: cfg.name,
        transport: cfg.transport as 'sse' | 'stdio',
        url: cfg.url || undefined,
        command: cfg.command || undefined,
        args: cfg.args ? JSON.parse(cfg.args) : undefined,
      })
      console.log(`MCP: connected to ${cfg.name}`)
    } catch (e) {
      console.error(`MCP: failed to connect to ${cfg.name}`, e)
    }
  }
}
```

**File: `apps/web/src/app/api/mcp/tools/route.ts`** — `GET` returns all tools from all connected servers.
**File: `apps/web/src/app/api/mcp/call/route.ts`** — `POST { serverName, toolName, args }` calls a tool and returns result.
**File: `apps/web/src/app/api/mcp/servers/route.ts`** — `GET`/`POST`/`DELETE` manage `MCPServerConfig` records.

***

### EPIC-14-E-04 — Build the CLI (`creator-cli`)

**Type:** Execute
**File: `packages/mcp-client/src/cli.ts`:**
```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { McpClient } from './McpClient.js'

const client = new McpClient()
const program = new Command()

program.name('creator-cli').description('Creator OS CLI — manage content from your terminal').version('1.0.0')

// Connect to internal SSE server on startup
async function connect() {
  await client.connect({ name: 'creator-os', transport: 'sse', url: process.env.CREATOR_OS_URL || 'http://localhost:3200/sse' })
}

program.command('note:create <title> [content]')
  .description('Create a new note')
  .action(async (title, content) => {
    const spinner = ora('Creating note...').start()
    await connect()
    const result = await client.callTool('creator-os', 'create_note', { title, content })
    spinner.succeed(chalk.green(result.content.text))
    await client.disconnectAll()
  })

program.command('note:search <query>')
  .description('Search across all notes, posts, and chapters')
  .action(async (query) => {
    await connect()
    const result = await client.callTool('creator-os', 'search_content', { query })
    console.log(result.content.text)
    await client.disconnectAll()
  })

program.command('post:create <title>')
  .description('Create a new blog/newsletter draft')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (title, opts) => {
    await connect()
    const tags = opts.tags ? opts.tags.split(',') : []
    const result = await client.callTool('creator-os', 'create_post', { title, tags })
    console.log(chalk.green(result.content.text))
    await client.disconnectAll()
  })

program.command('post:publish <id>')
  .description('Publish a post by ID')
  .action(async (id) => {
    await connect()
    const result = await client.callTool('creator-os', 'publish_post', { id })
    console.log(chalk.green(result.content.text))
    await client.disconnectAll()
  })

program.command('episode:create <title> <podcastId>')
  .description('Create a new podcast episode draft')
  .action(async (title, podcastId) => {
    await connect()
    const result = await client.callTool('creator-os', 'create_episode', { title, podcastId })
    console.log(chalk.green(result.content.text))
    await client.disconnectAll()
  })

program.command('agent:run hatflowId> <prompt>')
  .description('Run a Flowise AI agent chatflow')
  .action(async (chatflowId, prompt) => {
    const spinner = ora('Running agent...').start()
    await connect()
    const result = await client.callTool('creator-os', 'run_ai_agent', { chatflowId, prompt })
    spinner.stop()
    console.log(result.content.text)
    await client.disconnectAll()
  })

program.command('tools:list [server]')
  .description('List all available MCP tools (optionally filter by server name)')
  .action(async (serverArg) => {
    await connect()
    const serverName = serverArg || 'creator-os'
    const tools = await client.listTools(serverName)
    tools.tools.forEach(t => {
      console.log(chalk.cyan(`  ${t.name}`) + chalk.gray(` — ${t.description}`))
    })
    await client.disconnectAll()
  })

program.parse()
```
**Add to `packages/mcp-client/package.json`:**
```json
"bin": { "creator-cli": "./dist/cli.js" },
"scripts": { "build": "tsc", "dev": "tsx src/cli.ts" }
```

***

### EPIC-14-V-01 — Validate MCP Client and CLI

**Type:** Validate
**Commands to run (all must exit 0 with meaningful output):**
```bash
# Build
cd packages/mcp-client && pnpm build

# Link CLI globally
pnpm link --global

# Test CLI (Creator OS dev server + MCP SSE server must be running)
creator-cli note:create "Test from CLI"
# Expected: "Created note 'Test from CLI' with id: ..."

creator-cli note:search "cybersecurity"
# Expected: JSON array of matching content items

creator-cli tools:list
# Expected: list of all registered MCP tools

creator-cli post:create "My First Newsletter" --tags "security,news"
# Expected: "Created post 'My First Newsletter' (id: ..., slug: ...)"
```
**Also validate via Next.js API:**
- `GET /api/mcp/tools` returns JSON array of tools from connected servers
- `POST /api/mcp/call` with `{ serverName: "creator-os", toolName: "search_content", args: { query: "test" } }` returns results

***

## EPIC-15: Container Build & Packaging

**Goal:** A single Docker image that runs the complete Creator OS stack: Next.js, MCP SSE server, Flowise, Activepieces, Owncast, and Nginx — all managed by supervisord.

***

### EPIC-15-A-01 — Assess Container Process Inventory

**Type:** Assess
**Description:** List every process that must run inside the container. Write to `infra/docker/PROCESS_INVENTORY.md`:
```
PID 1:    supervisord
  ├─ nginx          (port 80 → routes to internal services)
  ├─ next.js        (port 3000 — main app)
  ├─ mcp-sse        (port 3200 — MCP SSE transport)
  ├─ flowise        (port 3100 — AI agent builder)
  ├─ activepieces   (port 8200 — automation)
  └─ owncast        (port 8080 — live streaming)

Optional (disabled by default, enabled via env var):
  └─ ollama         (port 11434 — local LLM)

Volumes (must be persistent):
  /data/db          → SQLite database
  /data/media       → audio/video uploads
  /data/videos      → HLS segments
  /data/flowise     → Flowise flows
  /data/activepieces→ Activepieces data
  /data/owncast     → Owncast config
```

***

### EPIC-15-E-01 — Write supervisord Config

**Type:** Execute
**File: `infra/supervisord/supervisord.conf`:**
```ini
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
priority=10

[program:nextjs]
command=node /app/apps/web/server.js
directory=/app
autostart=true
autorestart=true
environment=DATABASE_URL="file:/data/db/creator-os.db",PORT="3000",NODE_ENV="production"
priority=20

[program:mcp-sse]
command=node /app/packages/mcp-server/dist/sse-server.js
directory=/app
autostart=true
autorestart=true
environment=DATABASE_URL="file:/data/db/creator-os.db"
priority=25

[program:flowise]
command=npx flowise start
directory=/app
autostart=true
autorestart=true
environment=PORT="3100",DATABASE_PATH="/data/flowise/database.sqlite",SECRETKEY_PATH="/data/flowise/"
priority=30

[program:activepieces]
command=node /app/node_modules/.bin/activepieces start
directory=/app
autostart=true
autorestart=true
environment=AP_DB_TYPE="SQLITE3",AP_SQLITE_DATABASE_FILE="/data/activepieces/activepieces.db",AP_PORT="8200"
priority=30

[program:owncast]
command=/usr/local/bin/owncast -webserverport 8080 -rtmpport 1935 -configDir /data/owncast
autostart=true
autorestart=true
priority=40
```

***

### EPIC-15-E-02 — Write Nginx Internal Router Config

**Type:** Execute
**File: `infra/nginx/nginx.conf`:**
```nginx
events { worker_connections 1024; }
http {
  upstream nextjs    { server 127.0.0.1:3000; }
  upstream flowise   { server 127.0.0.1:3100; }
  upstream activepieces { server 127.0.0.1:8200; }
  upstream owncast   { server 127.0.0.1:8080; }
  upstream mcp_sse   { server 127.0.0.1:3200; }

  server {
    listen 80;
    client_max_body_size 500M;

    # Default: Next.js app
    location / {
      proxy_pass http://nextjs;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }

    # MCP SSE — needs no-buffering for SSE
    location /mcp-sse/ {
      proxy_pass http://mcp_sse/;
      proxy_set_header Connection '';
      proxy_http_version 1.1;
      proxy_buffering off;
      proxy_cache off;
    }

    # HLS media files — served directly from filesystem for performance
    location /media/ {
      alias /data/;
      add_header Access-Control-Allow-Origin *;
    }
  }
}
```

***

### EPIC-15-E-03 — Write Multi-Stage Dockerfile

**Type:** Execute
**File: `infra/docker/Dockerfile`:**
```dockerfile
# ─── Stage 1: Dependency installer ───────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/mcp-client/package.json ./packages/mcp-client/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build
RUN cd packages/mcp-server && pnpm build
RUN cd packages/mcp-client && pnpm build

# ─── Stage 3: Runner ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# System dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    pandoc \
    ffmpeg \
    wget \
    curl \
    tini

# Install Owncast binary
RUN wget -q https://github.com/owncast/owncast/releases/latest/download/owncast-linux-amd64.zip \
    && unzip owncast-linux-amd64.zip -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/owncast \
    && rm owncast-linux-amd64.zip

# Copy built app
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-client/dist ./packages/mcp-client/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/generated ./packages/db/generated

# Copy infra configs
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/supervisord/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy and make entrypoint executable
COPY infra/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directories
RUN mkdir -p /data/db /data/media /data/videos/hls /data/flowise /data/activepieces /data/owncast

EXPOSE 80 1935
VOLUME ["/data"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
```

***

### EPIC-15-E-04 — Write Entrypoint Script

**Type:** Execute
**File: `infra/docker/entrypoint.sh`:**
```bash
#!/bin/sh
set -e

# Run DB migrations
cd /app && DATABASE_URL="file:/data/db/creator-os.db" npx prisma migrate deploy

# Seed default user if ADMIN_EMAIL is set and no users exist
if [ -n "$ADMIN_EMAIL" ]; then
  DATABASE_URL="file:/data/db/creator-os.db" \
  ADMIN_EMAIL="$ADMIN_EMAIL" \
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}" \
  node packages/db/seed.js || true
fi

# Store default user ID for MCP/webhook use
# (set via a post-seed script or manually)

# Start supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

***

### EPIC-15-E-05 — Write Docker Compose File

**Type:** Execute
**File: `docker-compose.yml`** (repo root):
```yaml
version: '3.8'
services:
  creator-os:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile
    ports:
      - "80:80"       # Web UI
      - "1935:1935"   # RTMP for OBS live streaming
    volumes:
      - creator-data:/data
    environment:
      - ADMIN_EMAIL=admin@creator-os.local
      - ADMIN_PASSWORD=changeme
      - NEXTAUTH_SECRET=replace-with-64-char-secret
      - NEXTAUTH_URL=http://localhost
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - WEBHOOK_SECRET=replace-with-32-char-secret
      - FLOWISE_API_KEY=replace-with-flowise-key
    restart: unless-stopped

volumes:
  creator-data:
    driver: local
```

***

### EPIC-15-V-01 — Validate Container Build

**Type:** Validate
**Commands:**
```bash
docker compose build --no-cache     # must complete without error
docker compose up -d
sleep 15  # allow all processes to start

# Check all processes are running
docker compose exec creator-os supervisorctl status
# Expected: all programs show RUNNING

# Check all endpoints
curl -s -o /dev/null -w "%{http_code}" http://localhost/       # 200 or 302
curl -s -o /dev/null -w "%{http_code}" http://localhost/rss.xml   # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost/podcast.xml # 200
curl -s http://localhost:8080/api/status                          # Owncast JSON

# Check data persistence
docker compose restart
sleep 10
curl http://localhost/api/auth/session   # should not error
```
**Pass criteria:**
- All 6 `supervisorctl status` entries show `RUNNING`
- All HTTP checks return expected codes
- After restart, DB data persists (no data loss from restart)
- Container image size < 2GB

***

## Ticket Dependency Map

```
EPIC-01 (Scaffold)
  └─► EPIC-02 (Database)
        └─► EPIC-03 (Auth)
              └─► EPIC-04 (Shell UI)
                    ├─► EPIC-05 (Notes)
                    ├─► EPIC-06 (Publish)
                    ├─► EPIC-07 (Book Writing)
                    ├─► EPIC-08 (Podcast)
                    ├─► EPIC-09 (Video)
                    ├─► EPIC-10 (AI Chat)
                    ├─► EPIC-11 (Flowise)
                    ├─► EPIC-12 (Activepieces)
                    ├─► EPIC-13 (MCP Server) ─► EPIC-14 (MCP Client)
                    └─► EPIC-15 (Container) ← all EPICs
```

EPIC-05 through EPIC-14 can be built in parallel once EPIC-04 is complete. EPIC-15 integrates everything and should be attempted only after EPIC-13 and EPIC-14 validate successfully.

***

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Prisma connection string |
| `NEXTAUTH_SECRET` | ✅ | — | 64-char random string |
| `NEXTAUTH_URL` | ✅ | — | Full app URL |
| `ADMIN_EMAIL` | ✅ | — | Initial admin user email |
| `ADMIN_PASSWORD` | ✅ | `changeme` | Initial admin password |
| `OPENAI_API_KEY` | ☑️ | — | Required for OpenAI models |
| `ANTHROPIC_API_KEY` | ☑️ | — | Required for Anthropic models |
| `OLLAMA_BASE_URL` | ☑️ | `http://localhost:11434` | Local LLM endpoint |
| `FLOWISE_API_KEY` | ☑️ | — | Flowise API authentication |
| `WEBHOOK_SECRET` | ✅ | — | Shared secret for inbound webhooks |
| `CREATOR_OS_URL` | CLI only | `http://localhost:3200` | MCP SSE server URL for CLI |