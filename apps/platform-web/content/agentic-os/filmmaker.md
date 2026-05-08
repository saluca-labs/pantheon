# Filmmaker OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, mirroring the Creator OS, Maker OS, Health OS, and Secure Dev OS documents in this series.[^1]
Epics are independent enough to be parallelized once EPIC-01 and EPIC-02 complete.
Every Execute ticket includes exact file paths, package names, and commands. Validate tickets include concrete pass/fail criteria an automated agent can evaluate without ambiguity.

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
| Fountain parser | `fountain-js` | MIT | npm latest |
| Canvas/drawing | Konva.js (`konva` + `react-konva`) | MIT | latest |
| Illustration | Fabric.js (`fabric`) | MIT | 6.x |
| PDF render | `@react-pdf/renderer` | MIT | 3.x |
| Export | `pandoc` (subprocess binary) | GPL-2+ | 3.x |
| State | `zustand` | MIT | 4.x |
| MCP | `@modelcontextprotocol/sdk` | MIT | latest |
| AI SDK | `ai` (Vercel AI SDK) | Apache-2.0 | 3.x |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | MIT | latest |
| Process mgr | `supervisord` | MIT | 4.x |
| Proxy | `nginx` | BSD | 1.25.x |
| Container | Docker multi-stage | Apache-2.0 | 25.x |

### Filmmaker Co-Processes

| Function | Default Tool | License | Notes |
|---|---|---|---|
| Screenwriting | `fountain-js` (npm) + Fountain format files | MIT | Plain-text screenplay format used by professionals; parser renders to HTML/PDF[^2][^3][^4][^5][^6] |
| Full screenwriting IDE | Story Architect (STARC) | GPL | Desktop app for screenplay, comics, novel, play, audio drama with project bible, character/location maps[^7][^8][^9] |
| Storyboarding | Storyboarder (Wonder Unit) | MIT | Free, open-source, hand-drawn storyboards; exports PNG, GIF, MP4, animatic[^10][^11][^12] |
| Illustration/concept art | Krita | GPL | Storyboard Docker (SVG/PDF export), full painting + animation pipeline[^13][^14][^15] |
| Automation | n8n | Fair-code | Workflow automation for production reminders and integrations |
| Budgeting baseline | CineSpend (open source) | MIT | Free, open-source film budgeting released by the film community[^16] |
| Production scheduling | CineSched (open source) | MIT | Free, open-source production scheduling[^16] |

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** Create `~/filmmaker-os/` Turborepo with working Next.js app shell, shared packages, and CI-ready config.

### EPIC-01-A-01 — Assess Existing Environment

**Type:** Assess
**Commands:**
```bash
node --version      # >= 20.0.0
pnpm --version      # >= 9.0.0
docker --version    # >= 25.0.0
git --version       # any recent
pandoc --version    # >= 3.0 (install if missing)
```
**Output:** `SETUP_LOG.md` at repo root.

### EPIC-01-A-02 — Assess Monorepo Structure

**Type:** Assess
**Output:** `ARCHITECTURE.md`:
```
filmmaker-os/
├── apps/
│   └── web/                        # Next.js 14 main app
├── packages/
│   ├── ui/                         # shared shadcn components
│   ├── db/                         # Prisma schema + client
│   ├── fountain/                   # Fountain parser wrapper
│   ├── mcp-server/                 # MCP server
│   └── mcp-client/                 # MCP client + CLI
├── infra/
│   ├── nginx/
│   ├── supervisord/
│   └── docker/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### EPIC-01-P-01 — Plan Turborepo Pipeline Config

**Type:** Plan
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build":        { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":          { "cache": false, "persistent": true },
    "lint":         { "outputs": [] },
    "test":         { "outputs": [] },
    "db:generate":  { "cache": false }
  }
}
```

### EPIC-01-E-01 — Scaffold Turborepo Root

**Type:** Execute
```bash
mkdir filmmaker-os && cd filmmaker-os
git init
pnpm init
pnpm add -D turbo typescript @types/node
```

Files:
- `pnpm-workspace.yaml`: `packages: ['apps/*', 'packages/*']`
- `turbo.json`: content from EPIC-01-P-01
- `.gitignore`: `node_modules`, `.next`, `.turbo`, `dist`, `*.db`, `*.fountain` (generated previews only)
- `tsconfig.base.json`: strict, esModuleInterop, moduleResolution bundler, ES2022

### EPIC-01-E-02 — Scaffold Next.js App

**Type:** Execute
```bash
cd apps
pnpm create next-app@14 web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```
Post-scaffold:
- `apps/web/tsconfig.json` → add `"extends": "../../tsconfig.base.json"`
- `apps/web/package.json` → `"name": "@filmmaker-os/web"`

### EPIC-01-E-03 — Install shadcn/ui

**Type:** Execute
```bash
# from apps/web
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label textarea
pnpm dlx shadcn@latest add dropdown-menu navigation-menu sheet tabs
pnpm dlx shadcn@latest add toast sonner badge avatar separator dialog
pnpm dlx shadcn@latest add command popover select slider progress
```

### EPIC-01-E-04 — Scaffold Shared Packages

**Type:** Execute
```bash
mkdir -p packages/ui packages/db packages/fountain packages/mcp-server packages/mcp-client
```
Each: `package.json` with `@filmmaker-os/[name]` naming convention.

### EPIC-01-V-01 — Validate Monorepo Boots

**Type:** Validate
```bash
pnpm install          # exits 0
pnpm turbo run build  # no errors
pnpm turbo run dev    # localhost:3000 responds
```

***

## EPIC-02: Database Schema (Prisma)

**Goal:** Full schema covering every filmmaking domain: screenplays, story structure, characters, world, storyboards, concept art, production breakdowns, scheduling, budgeting, contracts, and adaptation.

### EPIC-02-A-01 — Audit All Data Entities

**Type:** Assess
`packages/db/ENTITIES.md`:

```text
// Auth
User, Session, Account (NextAuth)

// Projects (top-level container for all work)
Project (film, short, series, pilot, graphic novel, etc.)
ProjectCollaborator (role-based project access)

// ── DEVELOPMENT / WRITING ──

// Story Structure
StoryDocument (Bible, Treatment, Synopsis, One-Pager, Logline)
Act (three-act, four-act, or hero's journey breakpoints)
PlotPoint (inciting incident, midpoint, climax, etc.)
Scene (story-level scene; links to screenplay scene)
StoryBeat (micro-beat within a scene)
SubPlot
StoryThread (running theme or motif tracker)

// Characters
Character (name, role, archetype, goals, fears, wounds, arc)
CharacterRelationship (from, to, type: ally/rival/romantic/mentor)
CharacterNote (free-form development notes)

// World Building
WorldElement (location, faction, technology, mythology, culture, prop, creature)
WorldNote (linked notes for a WorldElement)
Timeline (in-world chronology with events)
TimelineEvent (event on the in-world timeline)
Map (image + annotations for world maps)

// Adaptation
AdaptationSource (novel, graphic novel, true story, public domain, original)
AdaptationNote (scene-by-scene mapping source → screenplay)

// ── SCREENWRITING ──

Screenplay (title, format: feature/short/tv/pilot/webseries, status)
ScreenplayVersion (version history; stores full Fountain text)
ScreenplayScene (parsed scene header, page range, scene number)
ScreenplayNote (inline note attached to a scene or line)
ScreenplayRevision (colored revision marks + status)
CharacterDialogueStats (per-character line/word counts derived from parse)

// ── STORYBOARDING ──

Storyboard (linked to Screenplay; one board per sequence)
StoryboardPanel (frame with image reference, description, camera info)
StoryboardAnnotation (note on a panel)
Animatic (assembled panel sequence with timing)

// ── CONCEPT ART / PRODUCTION DESIGN ──

ConceptArtCollection (group of concept pieces for a film element)
ConceptArtPiece (image file, medium, status: rough/final)
ProductionDesignNote (notes on visual style, color palette, art direction)

// ── PRE-PRODUCTION ──

ScriptBreakdown (one breakdown per ScreenplayScene)
BreakdownElement (cast, stunts, extras, props, costume, makeup, vehicles, animals, special fx, music, camera, set dressing, wardrobe)
ShootingDay (one day in the shooting schedule)
ScheduleStrip (one scene strip on a shooting day)
Location (physical location for shooting)
CastingNote (per-character casting status and notes)

// ── BUDGETING ──

Budget (top-level budget for a project)
BudgetAccount (ATL/BTL account categories)
BudgetLine (line item: description, rate, units, amount, fringe)
BudgetVersion (snapshot of a budget at a point in time)
BudgetNote (annotation on a line or account)
ActualExpense (tracked actual vs. estimated)

// ── CONTRACTS / LEGAL ──

Contract (type: option, shopping, talent, crew, location, NDA, co-production)
ContractParty (person or entity on the contract)
ContractClause (specific clause text; optional structured field)
ContractVersion (version history)
ContractSignature (signed status + date per party)
ChainOfTitle (IP ownership documentation)
ClearanceNote (music, IP, location clearance tracking)

// ── DISTRIBUTION / POST ──

DeliveryRequirement (deliverable spec: DCP, iTunes, broadcast, festival)
FestivalSubmission (festival name, deadline, status, result)
DistributionDeal (platform, territory, term, rights type)
MarketingAsset (poster, trailer, EPK, still — linked to file)

// ── SHARED INFRASTRUCTURE ──

MediaFile (image, video, audio — generic file store)
Tag
AIConversation, AIMessage
MCPServerConfig
AutomationTrigger, AutomationLog
ActivityLog
Setting
```

### EPIC-02-P-01 — Design Schema Relationships

**Type:** Plan
`packages/db/SCHEMA_PLAN.md`:

- `Project` is the top-level container. Every major entity has a `projectId` FK.
- `Project` 1→N `Screenplay`, `Storyboard`, `Budget`, `Contract`, `Character`, `WorldElement`, `StoryDocument`, `AdaptationSource`, `FestivalSubmission`.
- `Screenplay` 1→N `ScreenplayVersion` (latest flagged with `isHead`), 1→N `ScreenplayScene`, 1→N `ScreenplayRevision`.
- `ScreenplayScene` 1→1 `ScriptBreakdown`, 1→N `BreakdownElement`.
- `Character` 1→N `CharacterRelationship` (self-referencing via from/to), 1→N `CharacterNote`.
- `Storyboard` 1→N `StoryboardPanel` (ordered), 1→N `Animatic`.
- `Budget` 1→N `BudgetAccount` 1→N `BudgetLine`, 1→N `BudgetVersion`.
- `Contract` 1→N `ContractParty`, `ContractClause`, `ContractVersion`, `ContractSignature`.
- `ShootingDay` 1→N `ScheduleStrip`; `ScheduleStrip` references `ScreenplayScene`.
- All models: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.

### EPIC-02-E-01 — Install Prisma and Write Full Schema

**Type:** Execute
```bash
# from packages/db
pnpm add prisma @prisma/client
pnpm prisma init --datasource-provider sqlite
```

Key Prisma models (abbreviated — full file in `packages/db/prisma/schema.prisma`):

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

model Project {
  id               String               @id @default(cuid())
  title            String
  logline          String?
  format           String               @default("feature") // feature | short | tv | pilot | webseries | graphic_novel | novel
  status           String               @default("development") // development | pre_production | production | post | distribution
  coverImage       String?
  userId           String
  user             User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  collaborators    ProjectCollaborator[]
  storyDocuments   StoryDocument[]
  acts             Act[]
  plotPoints       PlotPoint[]
  scenes           Scene[]
  characters       Character[]
  worldElements    WorldElement[]
  timelines        Timeline[]
  maps             Map[]
  adaptationSources AdaptationSource[]
  screenplays      Screenplay[]
  storyboards      Storyboard[]
  conceptCollections ConceptArtCollection[]
  locations        Location[]
  shootingDays     ShootingDay[]
  budgets          Budget[]
  contracts        Contract[]
  festivalSubmissions FestivalSubmission[]
  distributionDeals DistributionDeal[]
  deliveryRequirements DeliveryRequirement[]
  marketingAssets  MarketingAsset[]
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt
}

model StoryDocument {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind      String   @default("bible") // bible | treatment | synopsis | one_pager | logline | outline | pitch_deck
  title     String
  content   String   @default("") // TipTap JSON
  version   Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Character {
  id               String                 @id @default(cuid())
  projectId        String
  project          Project                @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name             String
  role             String                 @default("supporting") // protagonist | antagonist | supporting | minor
  archetype        String?                // hero | mentor | shadow | trickster | herald | guardian | shape_shifter | ally
  logline          String?                // one-line description
  age              String?
  gender           String?
  backstory        String?
  goals            String?                // what they want
  needs            String?                // what they actually need
  fears            String?
  wounds           String?                // emotional wound from the past
  arc              String?                // where they start vs. end
  physicalDesc     String?
  voiceNotes       String?
  inspirationRefs  String?                // comma-separated image or text refs
  portraitImage    String?
  notes            CharacterNote[]
  relationshipsFrom CharacterRelationship[] @relation("RelFrom")
  relationshipsTo   CharacterRelationship[] @relation("RelTo")
  dialogueStats    CharacterDialogueStats[]
  castingNotes     CastingNote[]
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt
}

model CharacterRelationship {
  id          String    @id @default(cuid())
  fromId      String
  from        Character @relation("RelFrom", fields: [fromId], references: [id])
  toId        String
  to          Character @relation("RelTo", fields: [toId], references: [id])
  kind        String    @default("ally") // ally | rival | romantic | mentor | family | neutral | antagonist
  description String?
  projectId   String
}

model WorldElement {
  id          String       @id @default(cuid())
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  category    String       @default("location") // location | faction | technology | mythology | culture | prop | creature | religion | language | government | economics
  name        String
  description String?
  notes       WorldNote[]
  images      String?      // JSON array of MediaFile ids
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Timeline {
  id        String          @id @default(cuid())
  projectId String
  project   Project         @relation(fields: [projectId], references: [id])
  name      String          @default("Story Timeline")
  events    TimelineEvent[]
}

model TimelineEvent {
  id          String   @id @default(cuid())
  timelineId  String
  timeline    Timeline @relation(fields: [timelineId], references: [id], onDelete: Cascade)
  label       String
  date        String?  // in-world date string
  order       Int      @default(0)
  description String?
  sceneId     String?
}

model AdaptationSource {
  id          String             @id @default(cuid())
  projectId   String
  project     Project            @relation(fields: [projectId], references: [id])
  kind        String             @default("original") // novel | graphic_novel | true_story | public_domain | original | short_story | article
  title       String?
  author      String?
  rightsStatus String            @default("unknown") // optioned | purchased | public_domain | original | unknown
  notes       AdaptationNote[]
}

model AdaptationNote {
  id           String           @id @default(cuid())
  sourceId     String
  source       AdaptationSource @relation(fields: [sourceId], references: [id])
  sourceRef    String?          // chapter/page ref in source material
  sceneId      String?          // linked ScreenplayScene id
  note         String
  status       String           @default("todo") // todo | adapted | dropped | changed
}

model Screenplay {
  id          String              @id @default(cuid())
  projectId   String
  project     Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title       String
  format      String              @default("feature") // feature | short | tv | pilot | comic | stage | audio
  status      String              @default("draft") // draft | locked | production | revised | final
  currentVersion Int              @default(1)
  versions    ScreenplayVersion[]
  scenes      ScreenplayScene[]
  revisions   ScreenplayRevision[]
  dialogueStats CharacterDialogueStats[]
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

model ScreenplayVersion {
  id           String     @id @default(cuid())
  screenplayId String
  screenplay   Screenplay @relation(fields: [screenplayId], references: [id], onDelete: Cascade)
  versionNumber Int       @default(1)
  fountainText String     // raw Fountain markup; entire screenplay as text
  isHead       Boolean    @default(false)
  label        String?    // "First Draft", "Production Draft", etc.
  createdAt    DateTime   @default(now())
}

model ScreenplayScene {
  id           String            @id @default(cuid())
  screenplayId String
  screenplay   Screenplay        @relation(fields: [screenplayId], references: [id], onDelete: Cascade)
  sceneNumber  Int?
  heading      String            // e.g. "INT. KITCHEN - DAY"
  interior     Boolean           @default(true) // INT or EXT
  locationName String?
  timeOfDay    String?           // DAY | NIGHT | CONTINUOUS | etc.
  pageStart    Float?
  pageEnd      Float?
  eighths      Float?            // pages expressed in eighths
  synopsis     String?
  notes        ScreenplayNote[]
  breakdown    ScriptBreakdown?
  adaptationNotes AdaptationNote[]
  createdAt    DateTime          @default(now())
}

model ScreenplayNote {
  id       String          @id @default(cuid())
  sceneId  String
  scene    ScreenplayScene @relation(fields: [sceneId], references: [id])
  text     String
  kind     String          @default("note") // note | question | todo | director
  resolved Boolean         @default(false)
}

model ScreenplayRevision {
  id           String     @id @default(cuid())
  screenplayId String
  screenplay   Screenplay @relation(fields: [screenplayId], references: [id])
  color        String     @default("white") // standard WGA revision colors
  label        String?
  date         DateTime   @default(now())
  pages        String?    // JSON array of revised page numbers
  notes        String?
}

model ScriptBreakdown {
  id       String              @id @default(cuid())
  sceneId  String              @unique
  scene    ScreenplayScene     @relation(fields: [sceneId], references: [id])
  elements BreakdownElement[]
}

model BreakdownElement {
  id          String          @id @default(cuid())
  breakdownId String
  breakdown   ScriptBreakdown @relation(fields: [breakdownId], references: [id], onDelete: Cascade)
  category    String          // cast | stunt | extra | prop | costume | makeup | vehicle | animal | sfx | music | camera | set_dressing | wardrobe | vfx | location
  description String
  notes       String?
  status      String          @default("pending") // pending | confirmed | unavailable
}

model Storyboard {
  id        String             @id @default(cuid())
  projectId String
  project   Project            @relation(fields: [projectId], references: [id])
  title     String
  sequence  String?            // which sequence or act this covers
  panels    StoryboardPanel[]
  animatics Animatic[]
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt
}

model StoryboardPanel {
  id            String                  @id @default(cuid())
  storyboardId  String
  storyboard    Storyboard              @relation(fields: [storyboardId], references: [id], onDelete: Cascade)
  order         Int                     @default(0)
  imageFileId   String?
  imageFile     MediaFile?              @relation(fields: [imageFileId], references: [id])
  cameraAngle   String?                 // WS | MS | CU | ECU | OTS | POV | AERIAL | etc.
  cameraMove    String?                 // STATIC | PAN | TILT | DOLLY | CRANE | HANDHELD | RACK FOCUS
  description   String?
  dialogue      String?
  action        String?
  duration      Float?                  // seconds for animatic
  annotations   StoryboardAnnotation[]
  sceneId       String?                 // optional link to ScreenplayScene
  createdAt     DateTime                @default(now())
}

model StoryboardAnnotation {
  id      String          @id @default(cuid())
  panelId String
  panel   StoryboardPanel @relation(fields: [panelId], references: [id])
  text    String
  x       Float?          // annotation position on panel
  y       Float?
}

model Animatic {
  id           String     @id @default(cuid())
  storyboardId String
  storyboard   Storyboard @relation(fields: [storyboardId], references: [id])
  title        String
  audioFileId  String?
  videoFileId  String?
  durationSec  Float?
  createdAt    DateTime   @default(now())
}

model ConceptArtCollection {
  id          String            @id @default(cuid())
  projectId   String
  project     Project           @relation(fields: [projectId], references: [id])
  name        String
  category    String            @default("character") // character | location | prop | costume | vehicle | creature | title_card
  pieces      ConceptArtPiece[]
  notes       ProductionDesignNote[]
  createdAt   DateTime          @default(now())
}

model ConceptArtPiece {
  id           String               @id @default(cuid())
  collectionId String
  collection   ConceptArtCollection @relation(fields: [collectionId], references: [id])
  title        String
  imageFileId  String?
  imageFile    MediaFile?           @relation(fields: [imageFileId], references: [id])
  medium       String?              // digital | pencil | ink | watercolor | 3d_render
  status       String               @default("rough") // rough | refined | final | approved
  notes        String?
  createdAt    DateTime             @default(now())
}

model ProductionDesignNote {
  id           String               @id @default(cuid())
  collectionId String
  collection   ConceptArtCollection @relation(fields: [collectionId], references: [id])
  text         String
  refImages    String?              // JSON array of MediaFile ids
  createdAt    DateTime             @default(now())
}

model Location {
  id          String         @id @default(cuid())
  projectId   String
  project     Project        @relation(fields: [projectId], references: [id])
  name        String
  address     String?
  contactName String?
  contactEmail String?
  contactPhone String?
  permitStatus String         @default("unknown") // not_needed | pending | approved | denied | unknown
  notes       String?
  images      String?        // JSON array of MediaFile ids
  scheduleStrips ScheduleStrip[]
}

model ShootingDay {
  id          String          @id @default(cuid())
  projectId   String
  project     Project         @relation(fields: [projectId], references: [id])
  dayNumber   Int
  date        DateTime?
  callTime    String?
  wrapTime    String?
  notes       String?
  strips      ScheduleStrip[]
  createdAt   DateTime        @default(now())
}

model ScheduleStrip {
  id           String          @id @default(cuid())
  shootingDayId String
  shootingDay  ShootingDay     @relation(fields: [shootingDayId], references: [id])
  sceneId      String?
  scene        ScreenplayScene? @relation(fields: [sceneId], references: [id])
  locationId   String?
  location     Location?       @relation(fields: [locationId], references: [id])
  order        Int             @default(0)
  estimatedEighths Float?
  estimatedMinutes Float?
  notes        String?
  castRequired String?         // JSON array of Character ids
}

model Budget {
  id        String          @id @default(cuid())
  projectId String
  project   Project         @relation(fields: [projectId], references: [id])
  name      String          @default("Production Budget")
  currency  String          @default("USD")
  status    String          @default("draft") // draft | approved | final | actuals
  accounts  BudgetAccount[]
  versions  BudgetVersion[]
  expenses  ActualExpense[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
}

model BudgetAccount {
  id        String       @id @default(cuid())
  budgetId  String
  budget    Budget       @relation(fields: [budgetId], references: [id])
  code      String       // e.g. 1000, 2000
  name      String       // e.g. "Story & Rights", "Producers", "Cast"
  category  String       @default("atl") // atl | btl
  lines     BudgetLine[]
  notes     BudgetNote[]
}

model BudgetLine {
  id           String        @id @default(cuid())
  accountId    String
  account      BudgetAccount @relation(fields: [accountId], references: [id])
  description  String
  fringeRate   Float?        @default(0) // percentage
  rate         Float?        @default(0)
  units        Float?        @default(1)
  unitType     String?       // day | week | flat | per_mile | etc.
  totalEstimated Float       @default(0)
  notes        BudgetNote[]
}

model BudgetNote {
  id        String         @id @default(cuid())
  accountId String?
  account   BudgetAccount? @relation(fields: [accountId], references: [id])
  lineId    String?
  line      BudgetLine?    @relation(fields: [lineId], references: [id])
  text      String
}

model BudgetVersion {
  id           String   @id @default(cuid())
  budgetId     String
  budget       Budget   @relation(fields: [budgetId], references: [id])
  versionNumber Int     @default(1)
  snapshot     String   // JSON snapshot of full budget tree
  label        String?
  createdAt    DateTime @default(now())
}

model ActualExpense {
  id          String   @id @default(cuid())
  budgetId    String
  budget      Budget   @relation(fields: [budgetId], references: [id])
  lineId      String?
  description String
  amount      Float
  date        DateTime
  vendor      String?
  receiptFileId String?
  notes       String?
  createdAt   DateTime @default(now())
}

model Contract {
  id          String             @id @default(cuid())
  projectId   String
  project     Project            @relation(fields: [projectId], references: [id])
  kind        String             @default("talent") // option | shopping | talent | crew | location | nda | co_production | distribution | composer | music_license | life_rights
  title       String
  status      String             @default("draft") // draft | sent | negotiating | executed | expired | terminated
  effectiveDate DateTime?
  expirationDate DateTime?
  parties     ContractParty[]
  clauses     ContractClause[]
  versions    ContractVersion[]
  signatures  ContractSignature[]
  chainOfTitle ChainOfTitle[]
  clearanceNotes ClearanceNote[]
  templateId  String?
  notes       String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
}

model ContractParty {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])
  name       String
  role       String   // producer | director | talent | writer | composer | location_owner | co_producer
  email      String?
  company    String?
}

model ContractClause {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])
  order      Int      @default(0)
  heading    String
  text       String   // full clause text; can be TipTap JSON or plain text
  notes      String?
}

model ContractVersion {
  id            String   @id @default(cuid())
  contractId    String
  contract      Contract @relation(fields: [contractId], references: [id])
  versionNumber Int      @default(1)
  content       String   // full contract text snapshot
  label         String?
  createdAt     DateTime @default(now())
}

model ContractSignature {
  id         String    @id @default(cuid())
  contractId String
  contract   Contract  @relation(fields: [contractId], references: [id])
  partyName  String
  signedAt   DateTime?
  method     String    @default("wet") // wet | docusign | hellosign | manual
  fileId     String?   // signed PDF
}

model ChainOfTitle {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])
  description String
  documentType String // copyright_registration | assignment | option | wga_registration | proof_of_ownership
  fileId     String?
  date       DateTime?
  notes      String?
}

model ClearanceNote {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])
  category   String   // music | location | prop | archival_footage | trademark | likeness
  description String
  status     String   @default("pending") // pending | cleared | rejected | not_needed
  notes      String?
}

model FestivalSubmission {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  festivalName String
  category    String?
  deadline    DateTime?
  submittedAt DateTime?
  feeAmount   Float?
  status      String   @default("planned") // planned | submitted | accepted | rejected | waitlisted | withdrawn
  result      String?
  notes       String?
}

model DistributionDeal {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  platform    String   // Netflix | Amazon | theatrical | VOD | broadcast | educational | etc.
  territory   String   @default("worldwide")
  rightsType  String   // exclusive | non_exclusive | limited
  termStart   DateTime?
  termEnd     DateTime?
  advance     Float?
  royaltyRate Float?
  contractId  String?
  notes       String?
}

model MediaFile {
  id          String            @id @default(cuid())
  filename    String
  mimetype    String
  size        Int
  path        String
  url         String
  kind        String            @default("image") // image | video | audio | document | pdf
  storyboardPanels StoryboardPanel[]
  conceptPieces    ConceptArtPiece[]
  createdAt   DateTime          @default(now())
}
```

### EPIC-02-E-02 — Create Prisma Client Export

**Type:** Execute
`packages/db/index.ts` — standard singleton pattern (same as Creator OS EPIC-02-E-02 pattern).
`apps/web/.env.local`:
```
DATABASE_URL="file:../../data/filmmaker-os.db"
NEXTAUTH_SECRET="replace-with-32-char-random-string"
NEXTAUTH_URL="http://localhost:3000"
```

### EPIC-02-E-03 — Run Initial Migration

**Type:** Execute
```bash
# from packages/db
pnpm prisma generate
pnpm prisma migrate dev --name init
```

### EPIC-02-V-01 — Validate Schema

**Type:** Validate
```bash
pnpm prisma validate   # exits 0
pnpm prisma studio     # all models visible at localhost:5555
```
Pass: create one `Project`, one `Character`, one `Screenplay` via Studio; all persist.

***

## EPIC-03: Authentication Layer

**Goal:** NextAuth.js v5 with email+password credentials, session middleware.

(Identical in implementation to Creator OS EPIC-03.) Change package names to `@filmmaker-os/*`.[^1]

Key addition for this OS:
- Seed script should also create a default `Project` for the admin user.
- `ADMIN_PROJECT_TITLE` env var controls the default project title (default: `"My First Film"`).

***

## EPIC-04: Shell UI & Navigation

**Goal:** Persistent sidebar that maps to every production phase, with phase-based navigation grouping.

### EPIC-04-E-01 — Create App Layout with Sidebar

**Type:** Execute
`apps/web/src/app/(app)/layout.tsx` — standard sidebar + header layout.

`apps/web/src/components/shell/Sidebar.tsx`:

```typescript
const navGroups = [
  {
    label: 'Development',
    items: [
      { label: 'Projects',         href: '/projects',       icon: 'Film' },
      { label: 'Story',            href: '/story',          icon: 'BookOpen' },
      { label: 'Characters',       href: '/characters',     icon: 'Users' },
      { label: 'World Building',   href: '/world',          icon: 'Globe' },
      { label: 'Adaptation',       href: '/adaptation',     icon: 'GitBranch' },
    ]
  },
  {
    label: 'Writing',
    items: [
      { label: 'Screenplay',       href: '/screenplay',     icon: 'FileText' },
      { label: 'Storyboard',       href: '/storyboard',     icon: 'Layout' },
      { label: 'Concept Art',      href: '/concept',        icon: 'Palette' },
    ]
  },
  {
    label: 'Pre-Production',
    items: [
      { label: 'Breakdown',        href: '/breakdown',      icon: 'List' },
      { label: 'Schedule',         href: '/schedule',       icon: 'Calendar' },
      { label: 'Budget',           href: '/budget',         icon: 'DollarSign' },
      { label: 'Contracts',        href: '/contracts',      icon: 'FileSignature' },
      { label: 'Locations',        href: '/locations',      icon: 'MapPin' },
    ]
  },
  {
    label: 'Distribution',
    items: [
      { label: 'Festivals',        href: '/festivals',      icon: 'Award' },
      { label: 'Distribution',     href: '/distribution',   icon: 'Share2' },
      { label: 'Marketing',        href: '/marketing',      icon: 'Image' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'AI Assist',        href: '/ai',             icon: 'Bot' },
      { label: 'Automate',         href: '/automate',       icon: 'Zap' },
      { label: 'MCP',              href: '/mcp',            icon: 'Server' },
      { label: 'Settings',         href: '/settings',       icon: 'Settings' },
    ]
  },
]
```

### EPIC-04-E-02 — Create Stub Route Pages

**Type:** Execute
Create `page.tsx` stubs for all routes:
```
projects/  story/  characters/  world/  adaptation/
screenplay/  storyboard/  concept/
breakdown/  schedule/  budget/  contracts/  locations/
festivals/  distribution/  marketing/
ai/  automate/  mcp/  settings/
```

### EPIC-04-V-01 — Validate Shell

**Type:** Validate
- All routes render without 404
- Phase groupings visible in sidebar
- `pnpm tsc --noEmit` exits 0

***

## EPIC-05: Project Hub & Story Documents

**Goal:** The project dashboard and all development-phase writing: Bible, Treatment, Synopsis, Logline, Outline, One-Pager.

### EPIC-05-E-01 — Projects List & Create

**Type:** Execute
`/projects` — card grid of all projects with status badge, format tag, cover image.
`POST /api/projects` — create with title, format, optional logline.
`GET /api/projects/[id]` — full project overview page with phase progress tracker.

### EPIC-05-E-02 — Story Documents Editor

**Type:** Execute
`/story` — list of story documents for active project (Bible, Treatment, Synopsis, Logline, One-Pager, Outline, Pitch Deck).

- Each document type has a template prompt shown when empty (e.g., Bible template prompts: "Who is the protagonist?", "What is the world?").
- Editor: TipTap with full extension set (same as Creator OS Notes module).
- Auto-save: debounce 1000ms.
- Export: PDF via `@react-pdf/renderer` or Pandoc for DOCX.

**API routes:**
```
GET  /api/projects/[id]/documents     → list
POST /api/projects/[id]/documents     → create
PATCH /api/projects/[id]/documents/[did] → update
GET  /api/projects/[id]/documents/[did]/export → PDF/DOCX
```

### EPIC-05-E-03 — Plot Structure Tool

**Type:** Execute
`/story/structure` — visual act/beat board:

- Select structure template: Three-Act, Four-Act, Blake Snyder Beat Sheet, Hero's Journey, Dan Harmon Story Circle, Kishōtenketsu.
- Each template renders its required `PlotPoint` types as slots.
- Click any slot to write a synopsis for that beat.
- Save to `PlotPoint` records in DB.

### EPIC-05-V-01 — Validate Story Module

**Type:** Validate
- Create project → navigate to `/story` → create Treatment document → content saves.
- Select Three-Act structure → 8 beat slots appear → write logline in "Inciting Incident" slot → persists after refresh.
- Export Treatment to PDF → file downloads with correct formatting.

***

## EPIC-06: Character Development Module

**Goal:** Full character development workspace: character sheets, relationship maps, dialogue analysis.

### EPIC-06-E-01 — Character List & Sheet

**Type:** Execute
`/characters` — grid of character cards (portrait, name, role badge).
`/characters/[id]` — full character sheet page with tabbed sections:

- **Identity**: name, role, archetype, age, gender, physical description, portrait image upload
- **Psychology**: backstory, goals (external want), needs (internal need), fears, wounds, arc
- **Voice**: dialogue style notes, speech patterns, verbal tics, language level
- **References**: inspiration images, real-world references, mood board grid
- **Dialogue Stats**: word/line counts derived from screenplay parse (populated by EPIC-08)

API routes:
```
GET  /api/projects/[id]/characters
POST /api/projects/[id]/characters
PATCH /api/projects/[id]/characters/[cid]
DELETE /api/projects/[id]/characters/[cid]
```

### EPIC-06-E-02 — Character Relationship Map

**Type:** Execute
`/characters/map` — interactive force-directed graph using `d3-force`:

```bash
pnpm add d3 @types/d3
```

- Nodes = characters; edges = `CharacterRelationship` records.
- Edge color encodes relationship type (ally=green, rival=red, romantic=pink, mentor=blue, family=yellow).
- Click node → opens character sheet drawer.
- Click edge → shows relationship description.
- Add relationship: drag from one node to another → modal to set type and description.

### EPIC-06-V-01 — Validate Character Module

**Type:** Validate
- Create 3 characters → create 2 relationships → map renders graph with correct edge colors.
- Edit character backstory → auto-saves → refreshes without data loss.

***

## EPIC-07: World Building Module

**Goal:** A project wiki for world-building: locations, factions, lore, maps, timelines, and adaptation source tracking.

### EPIC-07-E-01 — World Elements Wiki

**Type:** Execute
`/world` — categorized sidebar (Location | Faction | Technology | Mythology | Culture | Prop | Creature | Religion | Language | Government | Economics).

- Each category lists `WorldElement` records.
- Click → rich TipTap editor for the element's notes + image gallery.

### EPIC-07-E-02 — In-World Timeline Viewer

**Type:** Execute
`/world/timeline` — horizontal scrollable timeline using `@dnd-kit`:

- Each `TimelineEvent` is a draggable card on the timeline.
- Events can be linked to `ScreenplayScene` records (shows scene heading as tooltip).
- Add/edit event modal.
- Export timeline as PNG (uses `html2canvas`):
```bash
pnpm add html2canvas
```

### EPIC-07-E-03 — Map Viewer & Annotator

**Type:** Execute
`/world/maps` — upload a map image and add location pins using Konva.js:

```typescript
// apps/web/src/components/world/MapAnnotator.tsx
import { Stage, Layer, Image, Circle, Text } from 'react-konva'
// Drag pin to place; click pin to add/edit label
// Pins link to WorldElement records (category=location)
```

### EPIC-07-E-04 — Adaptation Tracker

**Type:** Execute
`/adaptation` — source material tracker:

- Register source: title, author, rights status.
- Source scene list: table with columns (source chapter/page ref | adaptation note | linked screenplay scene | status: todo/adapted/dropped).
- "Coverage" progress bar: adapted ÷ total.

### EPIC-07-V-01 — Validate World Building

**Type:** Validate
- Add a Location world element → wiki note saves.
- Add 3 timeline events → reorder via drag → order persists.
- Upload map image → place 2 pins → pins persist after refresh.
- Add adaptation source with 3 notes, mark 1 as adapted → coverage bar shows 33%.

***

## EPIC-08: Screenplay Editor (Fountain)

**Goal:** A professional Fountain screenplay editor with live formatting preview, version control, scene panel, character stats, and PDF export. Backed by `Screenplay` and `ScreenplayVersion` Prisma models.

### EPIC-08-A-01 — Assess Fountain Implementation Strategy

**Type:** Assess
`apps/web/src/app/(app)/screenplay/FOUNTAIN_SPEC.md`:

- Fountain is the industry-standard plain-text screenplay format used by professional writers.[^2][^17][^3][^18]
- `fountain-js` (npm, MIT) parses `.fountain` text into a token array suitable for rendering as HTML or PDF.[^4][^5][^6]
- `fountain.ts` (npm) is a TypeScript-native alternative.[^19]
- The editor UI is a plain `<textarea>` or a CodeMirror 6 instance with Fountain syntax highlighting.
- Rendering: parsed tokens → HTML in a right panel showing properly formatted script (scene headings, action, dialogue).
- Export: `fountain-js` output → Pandoc → PDF/DOCX (industry-standard screenplay formatting).

### EPIC-08-E-01 — Install Fountain Dependencies

**Type:** Execute
```bash
# from apps/web
pnpm add fountain-js
pnpm add @codemirror/view @codemirror/state @codemirror/commands
pnpm add @codemirror/language @codemirror/lang-markdown
```

### EPIC-08-E-02 — Create Fountain Wrapper Package

**Type:** Execute
`packages/fountain/src/index.ts`:

```typescript
import Fountain from 'fountain-js'

export interface Parsedscreenplay {
  title: string
  scenes: ParsedScene[]
  html: {
    title_page: string
    script: string
  }
  tokens: any[]
}

export interface ParsedScene {
  sceneNumber: number | null
  heading: string
  interior: boolean
  location: string
  timeOfDay: string
  pageStart: number
  characters: string[]
  dialogueWordCount: Record<string, number>
}

export function parseFountain(text: string): ParsedScreenplay {
  const fountain = new Fountain()
  const result = fountain.parse(text, true) // true = output tokens
  // Extract scenes from tokens, compute character dialogue word counts
  const scenes: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let currentChar = ''
  let pageCount = 1

  for (const token of result.tokens) {
    if (token.type === 'scene_heading') {
      if (currentScene) scenes.push(currentScene)
      const isInterior = token.text.startsWith('INT')
      const parts = token.text.split(' - ')
      currentScene = {
        sceneNumber: token.scene_number || null,
        heading: token.text,
        interior: isInterior,
        location: parts?.replace(/^(INT\.|EXT\.|INT\.\/EXT\.) /i, '').trim(),
        timeOfDay: parts[^1]?.trim() || '',
        pageStart: pageCount,
        characters: [],
        dialogueWordCount: {},
      }
    }
    if (token.type === 'character' && currentScene) {
      currentChar = token.text.replace(/\s*\(.*\)/, '').trim()
      if (!currentScene.characters.includes(currentChar)) {
        currentScene.characters.push(currentChar)
      }
    }
    if (token.type === 'dialogue' && currentChar && currentScene) {
      const words = token.text.split(/\s+/).filter(Boolean).length
      currentScene.dialogueWordCount[currentChar] = (currentScene.dialogueWordCount[currentChar] || 0) + words
    }
    if (token.type === 'page_break') pageCount++
  }
  if (currentScene) scenes.push(currentScene)

  return {
    title: result.title || 'Untitled',
    scenes,
    html: { title_page: result.title_page || '', script: result.script || '' },
    tokens: result.tokens,
  }
}
```

### EPIC-08-E-03 — Create Screenplay API Routes

**Type:** Execute
```
GET  /api/projects/[id]/screenplays
POST /api/projects/[id]/screenplays     → create
GET  /api/screenplays/[sid]             → get with current ScreenplayVersion
PATCH /api/screenplays/[sid]            → update title/format/status
POST /api/screenplays/[sid]/save        → save new version (upsert ScreenplayVersion with isHead=true)
GET  /api/screenplays/[sid]/versions    → version history
POST /api/screenplays/[sid]/restore/[vid] → restore version as new head
GET  /api/screenplays/[sid]/parse       → parse current Fountain text, return scenes + character stats
POST /api/screenplays/[sid]/export      → Pandoc PDF/DOCX export
```

`POST /api/screenplays/[sid]/save` logic:
```typescript
// 1. Get current head version
// 2. Create new ScreenplayVersion with versionNumber = head.versionNumber + 1, isHead = true
// 3. Set old head isHead = false
// 4. Run parseFountain(fountainText) and upsert ScreenplayScene records
// 5. Upsert CharacterDialogueStats from parse result
```

### EPIC-08-E-04 — Build Screenplay Editor UI

**Type:** Execute
`apps/web/src/app/(app)/screenplay/[id]/page.tsx`:

Layout: three-panel (resizable):
- **Left (220px):** Scene panel — list of `ScreenplayScene` records: scene number, INT/EXT badge, location, TOD, page count in eighths. Click → scrolls editor to that scene.
- **Center (flex-1):** CodeMirror 6 Fountain editor. Full-screen monospaced editing experience.
- **Right (320px, collapsible):** Live HTML preview rendered from `parseFountain()`, styled with screenplay CSS (Courier 12pt equivalent in browser).

Toolbar:
- Current version badge + "Save Draft" button
- Version history dropdown (revert to any version)
- Export menu: PDF | DOCX | Fountain (raw)
- Revision color selector (white/blue/pink/yellow/green)
- Character stats toggle (opens drawer with per-character word/line counts)
- "Sync Scenes" button: re-parses Fountain and syncs `ScreenplayScene` DB records

Auto-save: debounce 5000ms (longer than notes — screenplays are larger documents).

### EPIC-08-E-05 — Build Fountain → PDF Export

**Type:** Execute
`/api/screenplays/[sid]/export/route.ts`:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export async function POST(req: Request, { params }: { params: { sid: string } }) {
  const { format } = await req.json() // 'pdf' | 'docx' | 'fountain'
  const version = await prisma.screenplayVersion.findFirst({
    where: { screenplayId: params.sid, isHead: true }
  })
  if (!version) return new Response('Not found', { status: 404 })

  if (format === 'fountain') {
    return new Response(version.fountainText, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="screenplay.fountain"`,
      },
    })
  }

  const tmpDir = `/tmp/screenplay-${params.sid}`
  await mkdir(tmpDir, { recursive: true })
  const fountainPath = path.join(tmpDir, 'script.fountain')
  const outPath = path.join(tmpDir, `script.${format}`)
  await writeFile(fountainPath, version.fountainText)

  // Pandoc with screenplay template for PDF; for DOCX use default reference
  const pandocArgs = format === 'pdf'
    ? `"${fountainPath}" -o "${outPath}" --from markdown`
    : `"${fountainPath}" -o "${outPath}"`

  await execAsync(`pandoc ${pandocArgs}`)
  const buffer = await readFile(outPath)
  await unlink(fountainPath); await unlink(outPath)

  const mimes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return new Response(buffer, {
    headers: {
      'Content-Type': mimes[format],
      'Content-Disposition': `attachment; filename="screenplay.${format}"`,
    },
  })
}
```

### EPIC-08-V-01 — Validate Screenplay Module

**Type:** Validate
- Paste a 5-page Fountain script → save → `ScreenplayScene` records created in DB.
- Left panel shows all scene headings with correct INT/EXT labels.
- Right panel preview renders dialogue in correct screenplay format (centered character name, indented dialogue).
- Export PDF → file downloads and opens with correct formatting.
- Revert to version 1 → Fountain text restores to v1 content.
- Character stats drawer shows per-character word counts.

***

## EPIC-09: Storyboard Module

**Goal:** A panel-based storyboard builder with image upload, camera metadata, panel reordering, and animatic preview.

### EPIC-09-E-01 — Install Storyboard Dependencies

**Type:** Execute
```bash
pnpm add konva react-konva
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### EPIC-09-E-02 — Create Storyboard API Routes

**Type:** Execute
```
GET  /api/projects/[id]/storyboards
POST /api/projects/[id]/storyboards
GET  /api/storyboards/[sid]                → with panels
POST /api/storyboards/[sid]/panels         → add panel
PATCH /api/storyboards/[sid]/panels/[pid]  → update panel
DELETE /api/storyboards/[sid]/panels/[pid]
POST /api/storyboards/[sid]/panels/reorder → update panel order (array of ids)
POST /api/upload/storyboard               → upload panel image → MediaFile
POST /api/storyboards/[sid]/animatic      → create animatic record
```

### EPIC-09-E-03 — Build Storyboard UI

**Type:** Execute
`/storyboard/[id]/page.tsx`:

Layout:
- **Header toolbar:** sequence name, link to screenplay, "Add Panel" button, "Export PDF" button, "Animatic Preview" button.
- **Panel grid:** `@dnd-kit/sortable` grid of `StoryboardPanel` cards; drag to reorder.

Each panel card:
```
┌─────────────────────────────────┐
│    [Image upload / preview]     │  ← click to upload or view image
│  Panel 001                      │
├─────────────────────────────────┤
│ Camera: WS → DOLLY              │  ← camera angle + move dropdowns
│ ─────────────────────────────── │
│ Description text...             │  ← short action/direction text
│ ─────────────────────────────── │
│ "Dialogue or narration..."      │  ← dialogue text
│ Duration: [2.5s]                │  ← for animatic timing
└─────────────────────────────────┘
```

Camera angle options: WS (Wide Shot) | MS (Medium Shot) | CU (Close-Up) | ECU (Extreme Close-Up) | OTS (Over the Shoulder) | POV | AERIAL | DUTCH | LOW ANGLE | HIGH ANGLE | INSERT
Camera move options: STATIC | PAN LEFT | PAN RIGHT | TILT UP | TILT DOWN | DOLLY IN | DOLLY OUT | CRANE UP | CRANE DOWN | HANDHELD | RACK FOCUS | ZOOM IN | ZOOM OUT

### EPIC-09-E-04 — Animatic Preview Player

**Type:** Execute
`/storyboard/[id]/animatic/page.tsx`:

- Load panels with `duration` values.
- Play panels sequentially using `setInterval` stepping through panels.
- If audio file attached to `Animatic` record, play it synchronized.
- Display panel image full-screen while playing.
- Controls: play/pause, speed (0.5x | 1x | 2x), jump to panel.

### EPIC-09-E-05 — PDF Storyboard Export

**Type:** Execute
`/api/storyboards/[sid]/export/route.ts`:
- Compose PDF using `@react-pdf/renderer` with a 2-column panel layout.
- Each panel: image (if available, else gray placeholder) + camera info + description + dialogue.
- Export as downloadable PDF.

### EPIC-09-V-01 — Validate Storyboard Module

**Type:** Validate
- Create storyboard with 6 panels → upload images to 3 → reorder via drag → order persists.
- Animatic plays panels at their set durations.
- PDF export downloads with panel grid layout.

***

## EPIC-10: Concept Art & Production Design Module

**Goal:** An image-organized production design workspace for concept art, mood boards, and visual direction notes.

### EPIC-10-E-01 — Concept Art API Routes

**Type:** Execute
```
GET  /api/projects/[id]/concept-collections
POST /api/projects/[id]/concept-collections
GET  /api/concept-collections/[cid]           → with pieces + design notes
POST /api/concept-collections/[cid]/pieces    → add piece (links to uploaded MediaFile)
PATCH /api/concept-collections/[cid]/pieces/[pid]
DELETE /api/concept-collections/[cid]/pieces/[pid]
POST /api/concept-collections/[cid]/notes     → add design note
POST /api/upload/concept                      → upload image → MediaFile
```

### EPIC-10-E-02 — Concept Art UI

**Type:** Execute
`/concept` — sidebar with categories (Character | Location | Prop | Costume | Vehicle | Creature | Title Card).

`/concept/[collectionId]/page.tsx`:
- Image masonry grid of `ConceptArtPiece` records.
- Each piece: image, title, medium badge, status badge (rough/refined/final/approved).
- Click → opens lightbox with full image + notes.
- "+ Add Piece" → drag-and-drop image upload dialog.
- "Production Design Notes" panel: TipTap editor for art direction notes (color palette, visual references, mood keywords).

### EPIC-10-V-01 — Validate Concept Art

**Type:** Validate
- Create collection → upload 3 images → masonry grid renders.
- Add design note → persists after refresh.
- Status change rough → approved → badge updates.

***

## EPIC-11: Script Breakdown Module

**Goal:** Auto-generate breakdown elements from parsed screenplay, and allow manual editing per scene.

### EPIC-11-E-01 — Auto-Breakdown from Fountain Parse

**Type:** Execute
`POST /api/screenplays/[sid]/breakdown` — triggered after screenplay parse:

```typescript
// For each ScreenplayScene, scan token array for:
// CAST: Character tokens in scene
// PROPS: Noun phrases after keywords like "picks up", "holds", "with a", "carrying"
// LOCATIONS: Scene heading location portion
// Also apply a regex-based simple extraction for common props

// Create/update ScriptBreakdown + BreakdownElement records per scene
```

### EPIC-11-E-02 — Breakdown Editor UI

**Type:** Execute
`/breakdown` — scene-by-scene breakdown:

- Left: scene list with status indicators.
- Right: selected scene's `BreakdownElement` cards organized by category.
- Each category (Cast | Stunts | Extras | Props | Costume | Makeup | Vehicle | Animal | SFX | Music | Camera | Set Dressing | VFX | Location) shows a colored-tag chip list.
- Click "+ Add Element" → type category and description → saves `BreakdownElement`.
- Eighths estimator: "How many eighths for this scene?" number input → saves to `ScreenplayScene.eighths`.
- Print all breakdowns: button → PDF breakdown report (one page per scene).

### EPIC-11-V-01 — Validate Breakdown

**Type:** Validate
- Import screenplay → trigger breakdown → at least Cast elements auto-populated for scenes with dialogue.
- Manually add a Prop element → persists.
- Eighths set to 2 for a scene → schedule module picks up the value.

***

## EPIC-12: Production Scheduling Module

**Goal:** A day-out-of-days shooting schedule — drag scenes onto shooting days, auto-calculate day length from eighths.

### EPIC-12-E-01 — Shooting Schedule API Routes

**Type:** Execute
```
GET  /api/projects/[id]/shooting-days
POST /api/projects/[id]/shooting-days        → create shooting day
PATCH /api/shooting-days/[did]               → update date/call time/notes
GET  /api/shooting-days/[did]/strips
POST /api/shooting-days/[did]/strips         → add scene strip
PATCH /api/shooting-days/[did]/strips/[sid]  → update strip order/notes
DELETE /api/shooting-days/[did]/strips/[sid] → remove strip
POST /api/projects/[id]/shooting-days/auto   → auto-assign all scenes to days (5 pages/day default)
```

### EPIC-12-E-02 — Strip Board UI

**Type:** Execute
`/schedule` — vertical stripboard view:

```
┌── Day 1 · [Date] · Call [07:00] ─────────────────────────────────────────┐
│  [Sc 12] INT. KITCHEN - DAY       Cast: Sarah, Mike       2/8 pages      │
│  [Sc 13] INT. KITCHEN - DAY       Cast: Sarah             1/8 pages      │
│  [Sc 45] INT. KITCHEN - NIGHT     Cast: Mike              3/8 pages      │
│  ──────────────────────────────────────────────────────────────────────  │
│  Total: 6/8 pages est. (~45 min)                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Scenes are color-coded by INT (warm) / EXT (cool).
- Drag scenes between days to reschedule (using `@dnd-kit`).
- "Unscheduled" column on the left shows all breakdown scenes not yet assigned.
- Day summary: total eighths, estimated shooting minutes, cast list for the day.
- One-click auto-schedule: assigns scenes to days trying to group by location.

### EPIC-12-V-01 — Validate Scheduling

**Type:** Validate
- 10 scenes in breakdown → auto-schedule assigns them to days.
- Drag scene to different day → strip updates in DB.
- Day total recalculates after move.

***

## EPIC-13: Film Budget Module

**Goal:** ATL/BTL budget builder with account codes, line items, fringe calculations, version snapshots, and actual expense tracking.

### EPIC-13-E-01 — Budget Templates Seed

**Type:** Execute
`packages/db/seeds/budget-templates.ts` — seed 3 ATL/BTL templates:

- **Feature Film** (accounts 1000–9000: Story/Rights, Producer, Director, Cast, Travel, ATL Fringes | BTL: Production Staff, Camera, Sound, Art, Set Construction, Costume, Makeup, Transportation, Location, Stock/Tape, Post-Production, Music, VFX, Insurance, G&A)
- **Short Film** (simplified 10-account version)
- **Music Video** (custom structure)

### EPIC-13-E-02 — Budget API Routes

**Type:** Execute
```
GET  /api/projects/[id]/budgets
POST /api/projects/[id]/budgets            → create (optionally from template)
GET  /api/budgets/[bid]                    → with accounts + lines
POST /api/budgets/[bid]/accounts           → add account
PATCH /api/budgets/[bid]/accounts/[aid]
POST /api/budgets/[bid]/accounts/[aid]/lines → add line item
PATCH /api/budgets/[bid]/lines/[lid]       → update rate/units/fringe
DELETE /api/budgets/[bid]/lines/[lid]
POST /api/budgets/[bid]/snapshot           → create BudgetVersion snapshot
GET  /api/budgets/[bid]/topsheet           → computed topsheet (account totals + grand total)
POST /api/budgets/[bid]/expenses           → log actual expense
```

`BudgetLine.totalEstimated` = `rate × units × (1 + fringeRate/100)` — computed on save.

### EPIC-13-E-03 — Budget UI

**Type:** Execute
`/budget/[id]/page.tsx`:

Layout: two-tab view — **Estimated Budget** | **Actuals**.

**Estimated tab:**
- ATL section → accounts → line items (inline editable spreadsheet-like table).
- BTL section same.
- Right sidebar: topsheet (account name | estimated total | % of total budget).
- Grand total ATL | Grand total BTL | Total Budget | Above-the-Line % badge.

```typescript
// Line item row columns:
// Code | Description | Rate | Units | Unit Type | Fringe% | Total | Notes
```

- Fringe rate field: editable per line.
- "Lock Budget" button: creates `BudgetVersion` snapshot; prevents accidental edits.

**Actuals tab:**
- Add actual expense form: description, amount, date, vendor, line item link (optional), receipt upload.
- Variance column: `estimated - actual` per account.
- Over/under badge per account.

### EPIC-13-E-04 — Budget PDF Topsheet Export

**Type:** Execute
`/api/budgets/[bid]/export/route.ts` — generate PDF topsheet using `@react-pdf/renderer`:

```typescript
// TopSheet PDF layout:
// Title block: film title, production company, budget date, version
// Two-column: Account Code | Account Name | ATL/BTL | Estimated Total
// Summary block: ATL Total | BTL Total | Grand Total | Contingency line
```

### EPIC-13-V-01 — Validate Budget Module

**Type:** Validate
- Create feature film budget from template → all 20+ accounts present.
- Add a line: Rate=$1000, Units=10, Fringe=21% → Total = $12,100.
- Lock budget → creates BudgetVersion → edits blocked.
- Log 2 actual expenses → variance column shows correct under/over.
- Export topsheet PDF → opens with account totals and grand total.

***

## EPIC-14: Contracts & Legal Module

**Goal:** Contract creation from templates, clause editor, party management, signature tracking, chain-of-title documentation, and clearance tracking.

### EPIC-14-E-01 — Contract Template Library Seed

**Type:** Execute
`packages/db/seeds/contract-templates.ts` — seed standard templates:

| Template | Type | Key Clauses |
|---|---|---|
| **Option Agreement** | option | Purchase price, option period, extension terms, credits |
| **Shopping Agreement** | shopping | Producer rights, exclusivity, term, compensation |
| **Talent Agreement (SAG)** | talent | Role, compensation, billing, exclusivity, media rights |
| **Crew Deal Memo** | crew | Position, rate, dates, work-for-hire |
| **Location Agreement** | location | Dates, fee, access, restoration, indemnification |
| **NDA / Confidentiality** | nda | Definition of confidential info, term, return of materials |
| **Co-Production Agreement** | co_production | Rights split, financing contribution, credit allocation |
| **Distribution Agreement** | distribution | Territory, term, royalty, delivery requirements |
| **Music License** | music_license | Master + sync rights, territory, term, fee |
| **Life Rights Agreement** | life_rights | Access, cooperation, consultation, approvals |

Each template stores pre-populated `ContractClause` records.[^20][^21][^22][^23][^24]

### EPIC-14-E-02 — Contract API Routes

**Type:** Execute
```
GET  /api/projects/[id]/contracts
POST /api/projects/[id]/contracts            → create (from template or blank)
GET  /api/contracts/[cid]                    → with parties, clauses, signatures
PATCH /api/contracts/[cid]
POST /api/contracts/[cid]/parties
POST /api/contracts/[cid]/clauses
PATCH /api/contracts/[cid]/clauses/[clid]
DELETE /api/contracts/[cid]/clauses/[clid]
POST /api/contracts/[cid]/clauses/reorder    → update clause order
POST /api/contracts/[cid]/sign/[partyId]     → mark party as signed
GET  /api/contracts/[cid]/export             → PDF export of full contract
POST /api/contracts/[cid]/version            → snapshot ContractVersion
POST /api/contracts/[cid]/chain              → add ChainOfTitle document
POST /api/contracts/[cid]/clearance          → add ClearanceNote
```

### EPIC-14-E-03 — Contract Editor UI

**Type:** Execute
`/contracts/[id]/page.tsx`:

Layout: two-panel — left sidebar (parties, status, metadata) + right main editor.

**Left sidebar:**
- Status badge (draft / sent / negotiating / executed / expired).
- Parties list with "Add Party" button.
- Effective date + expiration date pickers.
- Signature status per party (unsigned / signed ✓ + date).
- "Version History" dropdown.
- "Export PDF" + "Create Version Snapshot" buttons.

**Right main content (tabbed):**

- **Clauses tab**: drag-and-drop ordered list of `ContractClause` cards. Each clause: heading + TipTap editor. "Add Clause" button. "From Template" button (insert a standard clause).
- **Chain of Title tab**: table of IP ownership documents (type, description, date, file upload).
- **Clearances tab**: table of clearance needs (category, description, status: pending/cleared/rejected). Color-coded status badges.

### EPIC-14-E-04 — Contract PDF Export

**Type:** Execute
`/api/contracts/[cid]/export/route.ts`:

Using `@react-pdf/renderer`:
```typescript
// Contract PDF layout:
// Title block: contract type, project title, date
// Parties block: each party name, role, company
// Recitals (optional)
// Numbered clauses (heading bold + body text)
// Signature block: each party, printed name, date, signature line
// Exhibit pages for chain of title attachments (list only)
```

### EPIC-14-V-01 — Validate Contracts Module

**Type:** Validate
- Create NDA from template → 5 pre-populated clauses appear.
- Add 2 parties → mark one as signed → signature status badge updates.
- Reorder clauses via drag → order persists.
- Add chain of title document with PDF upload → persists.
- Export contract PDF → all parties and clauses present.

***

## EPIC-15: AI Screenwriting & Development Assistant

**Goal:** An AI assistant that understands the full project context (characters, world, structure, existing screenplay) and helps with development, writing, and coverage notes.

### EPIC-15-E-01 — AI Context Injection

**Type:** Execute
`apps/web/src/lib/filmmaker-context.ts`:

```typescript
export async function buildProjectContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { relationshipsFrom: true } },
      storyDocuments: { where: { kind: { in: ['bible', 'logline', 'synopsis', 'treatment'] } } },
      acts: true, plotPoints: true,
      worldElements: true,
      screenplays: {
        include: {
          versions: { where: { isHead: true } }
        },
        take: 1,
        orderBy: { updatedAt: 'desc' }
      }
    }
  })

  if (!project) return ''

  const parts: string[] = [
    `FILM: "${project.title}" (${project.format})`,
    project.screenplays?.versions ? `STATUS: ${project.screenplays.status}` : '',
    project.storyDocuments.find(d => d.kind === 'logline')?.content
      ? `LOGLINE: ${project.storyDocuments.find(d => d.kind === 'logline')?.content}` : '',
    `\nCHARACTERS:`,
    ...project.characters.map(c =>
      `- ${c.name} (${c.role}): ${c.logline || ''}\n  Goals: ${c.goals || 'unknown'} | Wound: ${c.wounds || 'unknown'} | Arc: ${c.arc || 'unknown'}`
    ),
    `\nWORLD ELEMENTS (${project.worldElements.length} total):`,
    ...project.worldElements.slice(0, 20).map(w => `- [${w.category}] ${w.name}: ${w.description || ''}`),
  ]

  const screenplay = project.screenplays?.versions
  if (screenplay) {
    // Include a synopsis, not the full fountain text (too long)
    parts.push(`\nSCREENPLAY: "${project.screenplays.title}"`)
    parts.push(`Version: ${screenplay.versionNumber} (${screenplay.label || 'Draft'})`)
    parts.push(`[Full script available — ask to reference specific scenes]`)
  }

  return parts.filter(Boolean).join('\n')
}
```

### EPIC-15-E-02 — Filmmaker AI Chat API

**Type:** Execute
`/api/ai/filmmaker/route.ts`:

```typescript
export async function POST(req: Request) {
  const { messages, projectId, model = 'gpt-4o', task } = await req.json()

  const projectContext = projectId ? await buildProjectContext(projectId) : ''

  const systemPrompts: Record<string, string> = {
    development: `You are a development executive and story consultant helping develop a film. ${projectContext}`,
    coverage: `You are a script reader providing professional script coverage. ${projectContext}`,
    dialogue: `You are a dialogue coach helping polish character voice and dialogue. ${projectContext}`,
    breakdown: `You are a line producer helping identify production requirements from a screenplay. ${projectContext}`,
    logline: `You are a marketing expert helping craft loglines, taglines, and pitches. ${projectContext}`,
    default: `You are an experienced filmmaker and story consultant. ${projectContext}`,
  }

  const result = await streamText({
    model: openai(model),
    messages,
    system: systemPrompts[task || 'default'],
  })
  return result.toDataStreamResponse()
}
```

### EPIC-15-E-03 — AI Tools in Screenplay Editor

**Type:** Execute
"AI Assist" dropdown in screenplay editor toolbar:

- **Script Coverage** — analyzes the script and returns logline, synopsis, character assessment, structure notes, and a commercial/artistic rating (1-10 each)
- **Character Voice Check** — picks a character; analyzes all their dialogue for consistency of voice
- **Beat Sheet Generator** — generates a 15-point Blake Snyder beat sheet from the current script
- **Scene X-Ray** — select a scene; AI breaks down subtext, dramatic function, and improvement suggestions
- **"Fix This Scene"** — AI rewrites a selected scene while preserving character voice and story logic
- **Logline Generator** — generates 5 logline variations from the script
- **Next Scene Draft** — given the previous scene's heading and description, drafts the next scene in Fountain format

### EPIC-15-V-01 — Validate AI Module

**Type:** Validate
- Script Coverage on a 5-page test script → returns all 5 fields (logline, synopsis, character, structure, ratings).
- Beat Sheet Generator → returns 15 named beats.
- "Next Scene Draft" → output is valid Fountain syntax that can be pasted into the editor without parse errors.

***

## EPIC-16: MCP Server (Filmmaker OS)

**Goal:** An MCP server exposing all Filmmaker OS resources and tools to AI clients (Claude Desktop, Cursor, Windsurf).

### EPIC-16-A-01 — Audit MCP Tools

**Type:** Assess
`packages/mcp-server/TOOLS_SPEC.md`:

```
RESOURCES:
  filmmaker://projects              → list all projects
  filmmaker://projects/{id}         → project overview (title, format, status)
  filmmaker://projects/{id}/characters → character list with loglines
  filmmaker://projects/{id}/screenplay → current screenplay head version (Fountain text)
  filmmaker://projects/{id}/breakdown  → breakdown summary per scene
  filmmaker://projects/{id}/budget     → budget topsheet

TOOLS:
  list_projects()                            → all project titles + ids
  get_character(projectId, name)             → full character profile
  search_screenplay(projectId, query)        → search Fountain text
  get_scene(projectId, sceneId)              → scene heading + content
  create_character(projectId, name, role)    → create character
  update_character(projectId, id, fields)    → update character fields
  add_world_element(projectId, category, name, description)
  save_screenplay_version(screenplayId, fountainText, label)
  generate_coverage(screenplayId)            → AI script coverage
  get_breakdown_elements(sceneId, category)  → elements by category
  add_breakdown_element(sceneId, category, description)
  get_budget_topsheet(projectId)             → account totals + grand total
  create_contract(projectId, kind, title)
  list_festivals(projectId)                  → festival submissions + status
  add_festival_submission(projectId, festivalName, deadline)
  run_ai_assist(projectId, task, prompt)     → filmmaker AI chat
```

### EPIC-16-E-01 — Implement MCP Server

**Type:** Execute
`packages/mcp-server/src/index.ts` — standard McpServer pattern (same structure as Creator OS EPIC-13-E-02, adapted for filmmaker domain entities).

Key tools implementation:

```typescript
server.tool(
  'save_screenplay_version',
  { screenplayId: z.string(), fountainText: z.string(), label: z.string().optional() },
  async ({ screenplayId, fountainText, label }) => {
    // Get current head version number
    const head = await prisma.screenplayVersion.findFirst({
      where: { screenplayId, isHead: true }
    })
    const nextVersion = (head?.versionNumber ?? 0) + 1
    // Set old head to false
    await prisma.screenplayVersion.updateMany({
      where: { screenplayId, isHead: true }, data: { isHead: false }
    })
    // Create new head
    const version = await prisma.screenplayVersion.create({
      data: { screenplayId, fountainText, versionNumber: nextVersion, isHead: true, label }
    })
    return { content: [{ type: 'text', text: `Saved version ${nextVersion}${label ? ` (${label})` : ''}` }] }
  }
)

server.tool(
  'get_budget_topsheet',
  { projectId: z.string() },
  async ({ projectId }) => {
    const budget = await prisma.budget.findFirst({
      where: { projectId },
      include: { accounts: { include: { lines: true } } },
      orderBy: { createdAt: 'desc' }
    })
    if (!budget) return { content: [{ type: 'text', text: 'No budget found' }] }

    const topsheet = budget.accounts.map(acc => {
      const total = acc.lines.reduce((s, l) => s + l.totalEstimated, 0)
      return `${acc.code} ${acc.name} [${acc.category.toUpperCase()}]: $${total.toLocaleString()}`
    })
    const grandTotal = budget.accounts.flatMap(a => a.lines).reduce((s, l) => s + l.totalEstimated, 0)
    topsheet.push(`\nGRAND TOTAL: $${grandTotal.toLocaleString()}`)
    return { content: [{ type: 'text', text: topsheet.join('\n') }] }
  }
)
```

### EPIC-16-V-01 — Validate MCP Server

**Type:** Validate
```bash
cd packages/mcp-server && pnpm build
npx @modelcontextprotocol/inspector node dist/index.js
```
Pass: all listed tools appear; `list_projects` returns projects; `save_screenplay_version` creates a new DB version.

***

## EPIC-17: CLI (filmmaker-cli)

**Goal:** Terminal access to all Filmmaker OS functions.

### EPIC-17-E-01 — Build CLI

**Type:** Execute
`packages/mcp-client/src/cli.ts` — using `commander` + `chalk` + `ora`:

```bash
filmmaker-cli project:list
filmmaker-cli project:create "The Long Dark" --format feature
filmmaker-cli character:create <projectId> "Alice" --role protagonist
filmmaker-cli character:list <projectId>
filmmaker-cli screenplay:save <screenplayId> --file ./script.fountain --label "First Draft"
filmmaker-cli screenplay:export <screenplayId> --format pdf
filmmaker-cli breakdown:generate <screenplayId>
filmmaker-cli budget:topsheet <projectId>
filmmaker-cli contract:list <projectId>
filmmaker-cli festival:add <projectId> "Sundance 2027" --deadline 2026-09-01
filmmaker-cli ai:coverage <screenplayId>
filmmaker-cli mcp:tools
```

### EPIC-17-V-01 — Validate CLI

**Type:** Validate
```bash
filmmaker-cli project:list   # returns list
filmmaker-cli character:create <id> "Test Character" --role supporting
# Expected: "Created character 'Test Character' (id: ...)"
filmmaker-cli budget:topsheet <id>
# Expected: formatted account list + grand total
```

***

## EPIC-18: n8n Automation Workflows

**Goal:** Pre-built n8n workflows for filmmaker production reminders and external integrations.

### EPIC-18-E-01 — Embed n8n + Pre-Built Workflows

**Type:** Execute
`/automate` iframe → n8n instance on port `5678`.

Starter workflows:
- **Festival Deadline Reminder**: daily check → for each `FestivalSubmission` with `status=planned` and `deadline` within 14 days → email/notification.
- **Contract Expiry Alert**: check `Contract` records with `expirationDate` within 30 days → notify.
- **Budget Over-Run Alert**: on new `ActualExpense` → recalculate account actual vs. estimated → if over 10% alert → notify.
- **Screenplay Version Webhook**: on new `ScreenplayVersion` → POST to webhook with version info (for external integrations).

***

## EPIC-19: Containerization

**Goal:** Single Docker image with all co-processes.

### EPIC-19-A-01 — Process Inventory

**Type:** Assess
`infra/docker/PROCESS_INVENTORY.md`:
```
PID 1:    supervisord
  ├─ nginx          (port 80)
  ├─ next.js        (port 3000)
  ├─ mcp-sse        (port 3200)
  └─ n8n            (port 5678)

System binaries:
  pandoc            (Fountain/DOCX/PDF export)
  ffmpeg            (animatic video assembly)

Volumes:
  /data/db          → SQLite database
  /data/uploads     → screenplay files, concept art, contract PDFs, receipts
  /data/n8n         → n8n workflows
```

### EPIC-19-E-01 — supervisord Config

**Type:** Execute
`infra/supervisord/supervisord.conf`:

```ini
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log

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
environment=DATABASE_URL="file:/data/db/filmmaker-os.db",PORT="3000",NODE_ENV="production"
priority=20

[program:mcp-sse]
command=node /app/packages/mcp-server/dist/sse-server.js
directory=/app
autostart=true
autorestart=true
environment=DATABASE_URL="file:/data/db/filmmaker-os.db"
priority=25

[program:n8n]
command=n8n
autostart=true
autorestart=true
environment=N8N_USER_FOLDER="/data/n8n",N8N_PORT="5678"
priority=30
```

### EPIC-19-E-02 — Dockerfile

**Type:** Execute
`infra/docker/Dockerfile` — multi-stage:

```dockerfile
FROM node:20-alpine AS deps
# ... pnpm install frozen lockfile

FROM node:20-alpine AS builder
# ... pnpm turbo run build + mcp-server + mcp-client

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache nginx supervisor pandoc ffmpeg wget curl tini

# Install n8n
RUN npm install -g n8n

# Copy built artifacts
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-client/dist ./packages/mcp-client/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/generated ./packages/db/generated

COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/supervisord/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY infra/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /data/db /data/uploads /data/n8n

EXPOSE 80
VOLUME ["/data"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
```

### EPIC-19-E-03 — docker-compose.yml

**Type:** Execute
```yaml
version: '3.8'
services:
  filmmaker-os:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile
    ports:
      - "80:80"
    volumes:
      - filmmaker-data:/data
    environment:
      - ADMIN_EMAIL=admin@filmmaker-os.local
      - ADMIN_PASSWORD=changeme
      - NEXTAUTH_SECRET=replace-64-char
      - NEXTAUTH_URL=http://localhost
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - ADMIN_PROJECT_TITLE=My First Film
    restart: unless-stopped

volumes:
  filmmaker-data:
    driver: local
```

### EPIC-19-V-01 — Validate Container

**Type:** Validate
```bash
docker compose build --no-cache
docker compose up -d
sleep 15
docker compose exec filmmaker-os supervisorctl status
# All programs: RUNNING
curl -s -o /dev/null -w "%{http_code}" http://localhost/        # 200
curl -s http://localhost:5678/healthz                           # n8n health check
docker compose restart
sleep 10
# Data persists after restart
```

***

## Ticket Dependency Map

```
EPIC-01 (Scaffold)
  └─► EPIC-02 (Database)
        └─► EPIC-03 (Auth)
              └─► EPIC-04 (Shell UI)
                    ├─► EPIC-05 (Project Hub + Story Documents)
                    ├─► EPIC-06 (Character Development)
                    ├─► EPIC-07 (World Building + Adaptation)
                    ├─► EPIC-08 (Screenplay / Fountain)
                    │         └─► EPIC-11 (Script Breakdown)
                    │               └─► EPIC-12 (Scheduling)
                    ├─► EPIC-09 (Storyboard)
                    ├─► EPIC-10 (Concept Art)
                    ├─► EPIC-13 (Budget)
                    ├─► EPIC-14 (Contracts)
                    ├─► EPIC-15 (AI Assistant)
                    ├─► EPIC-16 (MCP Server) ─► EPIC-17 (CLI)
                    ├─► EPIC-18 (Automation / n8n)
                    └─► EPIC-19 (Container) ← all EPICs
```

EPIC-05 through EPIC-18 can be developed in parallel once EPIC-04 is complete.
EPIC-11 depends on EPIC-08 (screenplay parse must exist before auto-breakdown).
EPIC-12 depends on EPIC-11 (breakdown eighths feed the schedule).
EPIC-19 integrates all EPICs and should be attempted last.

***

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Prisma connection string |
| `NEXTAUTH_SECRET` | ✅ | — | 64-char random string |
| `NEXTAUTH_URL` | ✅ | — | Full app URL |
| `ADMIN_EMAIL` | ✅ | — | Initial admin user email |
| `ADMIN_PASSWORD` | ✅ | `changeme` | Initial admin password |
| `ADMIN_PROJECT_TITLE` | ☑️ | `My First Film` | Title of seed project |
| `OPENAI_API_KEY` | ☑️ | — | Required for AI features |
| `ANTHROPIC_API_KEY` | ☑️ | — | Optional AI provider |
| `OLLAMA_BASE_URL` | ☑️ | `http://localhost:11434` | Local LLM |
| `FILMMAKER_OS_URL` | CLI only | `http://localhost:3200` | MCP SSE endpoint for CLI |

***

## Open Source Tools Summary

| Module | Tool | License | Source |
|---|---|---|---|
| Screenplay format | Fountain markup | Open standard | fountain.io[^2][^3][^18] |
| Fountain parser | `fountain-js` / `fountain.ts` | MIT | npm[^4][^5][^19][^6] |
| Screenwriting IDE (optional desktop bridge) | Story Architect (STARC) | GPL | starc.app[^7][^8][^9] |
| Storyboarding | Storyboarder (Wonder Unit) | MIT | GitHub[^10][^11][^12] |
| Illustration + concept art | Krita (Storyboard Docker) | GPL | krita.org[^13][^14][^15] |
| Canvas editor | Konva.js + react-konva | MIT | npm |
| Budgeting reference | CineSpend | MIT | GitHub[^16] |
| Scheduling reference | CineSched | MIT | GitHub[^16] |
| Automation | n8n | Fair-code | n8n.io |
| PDF rendering | `@react-pdf/renderer` | MIT | npm |
| Document export | Pandoc | GPL-2+ binary | pandoc.org |

---

## References

1. [Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/399744584/abd6ec54-7f74-4389-aec4-b0a0b60ab632/Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md?AWSAccessKeyId=ASIA2F3EMEYEUNZZX7LX&Signature=NHsD4moJ9J1rE7wqbL%2BDJGcxKBU%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEN%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIHvY9TRgRwKtRaabr7ZadxjFtdEBYPeb%2BY9nnuWaWhwqAiEA8XkH5N8R0PZ0DcFcg7Eu3zOOcCARvPUCImAgqwTxUGIq%2FAQIp%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDEHhiIAk5wXKKsbG3CrQBPFrlNLboCHnmfNI7RhH0DECV9zGeEL9H%2BsoYS0nSuMvfEmBlMd2rAq4pW%2FSv3tQLguPVYUh9BnX8e08TRSmKnGUGoFRSAWcchxXcAKW2EmdXnwvfcour9UHXaCxqz9%2FjXP27NT2Rx1%2B9HAIrcmfeCWYaPMt5%2B5vVBmKhh%2BQK%2BJCjK2LQxGDZdmsRtfiDz3qJDmrfFUDiTXbulmkB91y9yqHujiJnxi1oSJLdz3ZssIBxBkHS7HKynENFJl8Fma04z%2BYkHMdpgWpqX14j9dmltNzk5XkVo2YNHIHx1GgKeGJR0GIKxGlGx%2BlQ1g5v1b%2FwY2M4PrfcdRt2fTo2f6JPupt6VvS%2FLNmWY%2B3s%2Fcagole7ppSPPO4WcE7JQppMihbXHj0ypCSZuEx5QocMFBZKGfBR89Mh%2FT7FYVrQJZzaaYNCrB3gQWBtEcDNP0Jt7PKEhkCt%2BBhBIeLCmsUZF0lAPIYyiM6JctPyH0LAL%2BKWcVk2YjdSs76yDvUSL4ss0ZxHQMfvDH197iHhwq8CNI8Jx5zO5wo41obd06vgJSXXavJkJyMg0viTj2cmny7yMKBoNsHUoPzTwj9guPNaJrwLuJQxqbDdHhfOubw%2BtR4R7PJZsvuapQkNWjTAfY60R%2B8yyA6I1IWnLn8bGkUqJZW7JBFo5%2Fa5BIQ8oRmKHFsRSFEg7YGIZQyE3SVwn%2BhV3cOZyWrUihi4vmZA2M76TvAyhveDEBo3haKnd7V%2FaCL6ra0EIG2oHg%2FvcW1DnRGC4SmhJrKI1f%2BXWGEd9JKIM3t0msw7vvuzwY6mAFd7Ev1O%2B%2BsiKfbrZVClSOB2L23cKwwpmuX%2FUrkPKeMz%2BD6w46gFdziKd%2Bi00fGr2%2BfgI4QN%2BHFa8yT2rXgd4Nq%2BD%2Fw8KXsuyTEAdE6K8tS%2BniiKSm2QPAvnuXKBiC3DbL1BICWWnRKJWDflNv9j66nU5AneBrf1URZikVBBSRBXpvrHr6xoMad2f04bf1LccghUAx9cG1wPw%3D%3D&Expires=1778109377) - Every ticket follows EPIC-XX-APEV-NN where A Assess, P Plan, E Execute, V Validate. Epics are indepe...

2. [Fountain](https://fountain.io) - Fountain is a simple markup syntax for writing, editing and sharing screenplays in plain, human-read...

3. [nyousefi/Fountain: An open source implementation ...](https://github.com/nyousefi/Fountain) - Fountain is a simple markup syntax that allows screenplays to be written, edited, and shared in plai...

4. [fountain-js](https://www.npmjs.com/package/fountain-js) - A simple parser for Fountain, a markup language for formatting screenplays. Originally based on Matt...

5. [mattdaly/Fountain.js: A JavaScript parser for the screenplay ...](https://github.com/mattdaly/Fountain.js/) - fountain-js is a JavaScript based parser for the screenplay format Fountain. You can try fountain-js...

6. [thombruce/FountainJS: 🖋 Parsers for the Fountain ...](https://github.com/thombruce/FountainJS) - A JavaScript based parser for the screenplay format Fountain. About. Parsers for the Fountain screen...

7. [story-apps/starc: Reinventing the screenwriting software. - GitHub](https://github.com/story-apps/starc) - Story Architect is a project created by the authors of an open source screenwriting tool Kit Scenari...

8. [Story Architect](https://starc.app) - Story Architect is designed to allow you to store as many series of your story as you want in one pr...

9. [Install Story Architect (STARC) on Linux - Flathub](https://flathub.org/en/apps/dev.storyapps.starc) - Story Architect is a modern application for authors that combines flexibility and simplicity of the ...

10. [25 Best Storyboard Software in 2026 [Ultimate Guide]](https://www.studiobinder.com/blog/best-storyboard-software-free-storyboard-templates/) - We've compiled a list of the best storyboard software from offline storyboard creators to AI generat...

11. [Top 10 Storyboard Software for Animators in 2025 - Murphy](https://murphy.inc/top-10-storyboard-software-for-animators/) - Storyboarder is a free, open-source tool that's used by many independent animators, students, and sm...

12. [Top 10 Storyboarding Software for 3D Artists in 2025 - Blog](https://www.meshy.ai/blog/storyboarding-software) - MakeStoryboard is a user-friendly, cloud-based tool ideal for collaborative projects. It allows team...

13. [The Best Storyboard Software for Filmmaking in 2025 (with ...](https://filmustage.com/blog/the-best-storyboard-software-for-filmmaking-in-2025-with-real-world-picks/) - Discover the best storyboard software for filmmakers in 2025 — from AI-powered planning tools to pro...

14. [Storyboard Docker](https://docs.krita.org/en/reference_manual/dockers/storyboard_docker.html) - Krita's Storyboard Docker allows the user to develop a story by creating and managing scenes. This i...

15. [Question Regarding Repurposing Storyboard Docker as a ...](https://krita-artists.org/t/question-regarding-repurposing-storyboard-docker-as-a-page-manager/177358) - div

I have been trying to figure out if there’s a potential workaround on the lack of “Comics Manag...

16. [Free and Open Source Scheduling and Budgeting Apps](https://www.reddit.com/r/Filmmakers/comments/1rq0ou4/free_and_open_source_scheduling_and_budgeting_apps/) - As a gift to the film community, I'm releasing my two apps, "CineSched" and "CineSpend", as free and...

17. [I use fountain to write screenplays anywhere for free](https://www.reddit.com/r/Screenwriting/comments/1mr5aid/i_use_fountain_to_write_screenplays_anywhere_for/) - All through my college years I had been looking for the right screenwriting software, and eventually...

18. [Write your screenplay on Linux in Fountain markdown](https://opensource.com/article/21/12/linux-fountain) - The Fountain markdown technique requires just a plain text editor, like Atom, Kate, Gedit, or simila...

19. [fountain.ts](https://www.npmjs.com/package/fountain.ts) - Fountain-ts is a TypeScript based parser for the screenplay format Fountain. Based on Matt Daly's fo...

20. [Free Film Production Contract Template](https://www.pandadoc.com/film-production-contract-template/) - Use this free film production contract template to create a legal agreement for whatever your media ...

21. [Free Production Contract Template | Film, TV, Music, & More](https://www.lawdepot.com/us/business/production-contract/) - Create a custom Production Contract with LawDepot to define roles, rights, and terms. Protect your p...

22. [Film production contract template - free to use](https://juro.com/contract-templates/film-production-contract) - Create and automate agreements in minutes with this free film production contract template.

23. [Free Movie Production Agreement: Make & Sign](https://www.rocketlawyer.com/business-and-contracts/service-contracts/creative-freelance-contracts/document/movie-production-agreement) - Set details for a contract to produce a movie. Make, sign & save a customized Movie Production Agree...

24. [Free and Customizable NDA Contract Template](https://www.blauwfilms.com/research/free-nda-template-for-creative-projects) - This template is for filmmakers and creatives to use before discussing projects with potential colla...

