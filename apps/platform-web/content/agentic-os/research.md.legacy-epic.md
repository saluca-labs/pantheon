# Research OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, mirroring Creator OS / Maker OS / Business OS.[^1]
Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete.
Execute tickets include concrete file paths, package names, and commands; Validate tickets include pass/fail criteria that an automated agent can check without interpretation.

### Target User

Research OS is designed for:

- Solo PhD students or postdocs running a personal bench + computational workflow.
- Small academic labs (PI + a few trainees) needing shared ELN, inventory, and data management.[^2][^3]
- Industrial research teams that can start on the same stack and swap in their own infrastructure.

The system assumes heavy use of **arXiv**, journal PDFs, and lab experiments, with AI support tuned for **hypothesis generation, experiment design, and literature mapping** rather than content publishing.

***

## Frozen Tech Stack (All Tickets Assume This)

Same foundation as the other OSes for consistency.[^1]

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
| State | `zustand` | MIT | 4.x |
| MCP | `@modelcontextprotocol/sdk` | MIT | latest |
| AI SDK | `ai` (Vercel AI SDK) | Apache-2.0 | 3.x |
| Process mgr | `supervisord` | MIT | 4.x |
| Proxy | `nginx` | BSD | 1.25.x |
| Container | Docker multi-stage | Apache-2.0 | 25.x |

### Domain Co‑Processes (External Apps)

All run as separate services behind nginx, not as libraries.

| Function | Default Tool | License | Notes |
|---|---|---|---|
| Electronic lab notebook (ELN) | eLabFTW | AGPL 3.0 | Open-source ELN + inventory + booking; used in universities; supports APIs.[^2][^3][^4][^5][^6] |
| Computational notebooks | JupyterHub (JupyterLab) | BSD 3 | Multi-user Jupyter; integrates with HPC and containers.[^7][^8][^9] |
| Reference management | Zotero | AGPL 3.0 | Open-source reference manager with rich plugin ecosystem.[^10][^11][^12][^13] |
| Literature mapping | ResearchRabbit (external SaaS) | — | Not open source but widely used; integrated via API/bookmarklet + Zotero sync.[^14][^15][^16][^17] |
| Data repository | Dataverse | Apache-2.0 | Open-source research data repository platform with DOIs and rich metadata.[^18][^19][^20][^21] |
| LIMS/bench ops | eLabFTW inventory or Benchling alternative | AGPL/commercial | For sample & reagent inventory, optionally extended via MCP.[^2][^22][^23][^24] |
| Automation | n8n | Fair-code | Orchestration of ingest, ETL, notifications, and data publishing.[^17] |

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** Create `~/research-os/` Turborepo with Next.js app, shared packages, and infra skeleton, identical in structure to the other OSes but with `@research-os/*` prefixes.[^1]

(Commands and files match the patterns already used for Maker OS and Business OS; only names differ.)[^1]

***

## EPIC-02: Database Schema (Prisma)

**Goal:** A schema representing **experiments, samples, protocols, datasets, papers, hypotheses, and analyses**, designed for both individual bench work and small lab operations.

### EPIC-02-A-01 — Audit Entities

**Type:** Assess

Write `packages/db/ENTITIES.md` with exactly:

```text
User, Session, Account (NextAuth)
Lab (logical group – lab, group, or PI umbrella)
LabMember (user membership with role)
OrgSetting (feature flags and configuration)
Project (research project or sub-project)
Experiment (unit of bench work, linked to ELN)
Protocol (standard procedure template)
Sample (physical sample or aliquot)
SampleType
Reagent (chemical/antibody/plasmid/primer etc.)
InventoryLocation
Instrument (equipment used in lab)
InstrumentBooking
Hypothesis (explicitly tracked hypothesis)
HypothesisStatusChange
Paper (literature item; arXiv or journal)
PaperCollection (sets for topics/lit review)
CitationLink (relationship between papers)
ReadingNote (notes on a paper)
CodeRepository (analysis code or pipeline)
AnalysisRun (computational notebook run)
Dataset (internal dataset)
DatasetVersion
DatasetPublication (link to Dataverse/DOI)
Tag (shared tags)
AIConversation
AIMessage
MCPServerConfig
AutomationTrigger
AutomationLog
ActivityLog
```

### EPIC-02-P-01 — Plan Relationships

**Type:** Plan

`packages/db/SCHEMA_PLAN.md` describes:

- Multi-lab support: `Lab` 1→N `LabMember`; `LabMember` references `User`, with `role` (pi, postdoc, phd, tech, visitor).
- `Lab` 1→N `Project`, `Instrument`, `Sample`, `Reagent`, `Dataset`.
- `Project` 1→N `Experiment`, 1→N `Hypothesis`, 1→N `CodeRepository`, 1→N `Dataset`.
- `Experiment` 1→N `Sample` (produced/consumed), N→N `Reagent` via `ExperimentReagent` join.
- `Experiment` links to eLabFTW via `externalElnId` and to JupyterHub via `externalNotebookUrl`.
- `Hypothesis` 1→N `HypothesisStatusChange`; each change logs status (idea, under_test, supported, refuted, abandoned) and createdAt.
- `Paper` has `source` (arxiv, pubmed, doi, manual) and unique `identifier` (arXiv ID, DOI, PMID).[^14][^25][^15]
- `PaperCollection` N→N `Paper` (for topic-specific reading lists).
- `CitationLink` models directed citation (`citingPaperId` → `citedPaperId`).
- `ReadingNote` attaches to `Paper` and optionally to `Project` or `Hypothesis`.
- `CodeRepository` tracks Git URL and main branch; `AnalysisRun` links to a Git commit, notebook path, and environment.
- `Dataset` and `DatasetVersion` track internal data; `DatasetPublication` links to Dataverse DOI.[^19][^20][^21]

### EPIC-02-E-01 — Implement Schema

**Type:** Execute

Use the same Prisma pattern as the other OSes; key domain-specific models include:

```prisma
model Lab {
  id        String      @id @default(cuid())
  name      String
  piName    String?
  institution String?
  members   LabMember[]
  projects  Project[]
  instruments Instrument[]
  samples   Sample[]
  reagents  Reagent[]
  datasets  Dataset[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model LabMember {
  id        String   @id @default(cuid())
  labId     String
  lab       Lab      @relation(fields: [labId], references: [id], onDelete: Cascade)
  userId    String
  role      String   @default("phd") // pi | postdoc | phd | master | tech | visitor
  joinedAt  DateTime @default(now())
}

model Project {
  id          String      @id @default(cuid())
  labId       String
  lab         Lab         @relation(fields: [labId], references: [id])
  title       String
  description String?
  status      String      @default("active") // active | paused | completed | archived
  hypotheses  Hypothesis[]
  experiments Experiment[]
  papers      PaperCollection? @relation("ProjectPapers", fields: [paperCollectionId], references: [id])
  paperCollectionId String?
  datasets    Dataset[]
  codeRepos   CodeRepository[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Experiment {
  id             String      @id @default(cuid())
  projectId      String
  project        Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title          String
  description    String?
  date           DateTime    @default(now())
  externalElnId  String?     // eLabFTW experiment ID
  status         String      @default("planned") // planned | running | complete | failed
  samples        Sample[]
  reagents       ExperimentReagent[]
  instrumentId   String?
  instrument     Instrument? @relation(fields: [instrumentId], references: [id])
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

model Hypothesis {
  id          String                @id @default(cuid())
  projectId   String
  project     Project               @relation(fields: [projectId], references: [id])
  title       String
  description String?
  status      String                @default("idea")
  statusHistory HypothesisStatusChange[]
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
}

model HypothesisStatusChange {
  id           String     @id @default(cuid())
  hypothesisId String
  hypothesis   Hypothesis @relation(fields: [hypothesisId], references: [id], onDelete: Cascade)
  fromStatus   String?
  toStatus     String
  note         String?
  createdAt    DateTime   @default(now())
}

model Sample {
  id          String   @id @default(cuid())
  label       String
  typeId      String?
  type        SampleType? @relation(fields: [typeId], references: [id])
  labId       String
  lab         Lab       @relation(fields: [labId], references: [id])
  parentId    String?
  parent      Sample?   @relation("SampleLineage", fields: [parentId], references: [id])
  children    Sample[]  @relation("SampleLineage")
  locationId  String?
  location    InventoryLocation? @relation(fields: [locationId], references: [id])
  experimentId String?
  experiment  Experiment? @relation(fields: [experimentId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model SampleType {
  id        String   @id @default(cuid())
  name      String   @unique
  samples   Sample[]
}

model Reagent {
  id          String   @id @default(cuid())
  name        String
  vendor      String?
  catalogNo   String?
  lot         String?
  labId       String
  lab         Lab      @relation(fields: [labId], references: [id])
  experiments ExperimentReagent[]
}

model ExperimentReagent {
  id           String     @id @default(cuid())
  experimentId String
  experiment   Experiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  reagentId    String
  reagent      Reagent    @relation(fields: [reagentId], references: [id])
  amount       String?
}

model InventoryLocation {
  id        String   @id @default(cuid())
  label     String
  labId     String
  lab       Lab      @relation(fields: [labId], references: [id])
  samples   Sample[]
}

model Instrument {
  id          String            @id @default(cuid())
  labId       String
  lab         Lab               @relation(fields: [labId], references: [id])
  name        String
  model       String?
  serial      String?
  calendarUrl String?
  bookings    InstrumentBooking[]
}

model InstrumentBooking {
  id           String     @id @default(cuid())
  instrumentId String
  instrument   Instrument @relation(fields: [instrumentId], references: [id])
  userId       String
  startTime    DateTime
  endTime      DateTime
  purpose      String?
}

model Paper {
  id         String    @id @default(cuid())
  title      String
  identifier String?   @unique // DOI or arXiv ID
  source     String?   // arxiv | pubmed | crossref | manual
  url        String?
  journal    String?
  year       Int?
  abstract   String?
  tags       Tag[]
  notes      ReadingNote[]
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

model PaperCollection {
  id        String   @id @default(cuid())
  name      String
  papers    Paper[]
  project   Project?
}

model ReadingNote {
  id        String   @id @default(cuid())
  paperId   String
  paper     Paper    @relation(fields: [paperId], references: [id], onDelete: Cascade)
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id])
  content   String
  createdAt DateTime @default(now())
}

model CitationLink {
  id            String @id @default(cuid())
  citingPaperId String
  citedPaperId  String
}

model Dataset {
  id          String          @id @default(cuid())
  labId       String
  lab         Lab             @relation(fields: [labId], references: [id])
  projectId   String?
  project     Project?        @relation(fields: [projectId], references: [id])
  name        String
  description String?
  field       String? // genomics, single-cell, imaging, etc.
  versions    DatasetVersion[]
  publications DatasetPublication[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model DatasetVersion {
  id         String   @id @default(cuid())
  datasetId  String
  dataset    Dataset  @relation(fields: [datasetId], references: [id], onDelete: Cascade)
  version    Int
  storageUrl String   // internal storage path
  checksum   String?
  createdAt  DateTime @default(now())
}

model DatasetPublication {
  id         String   @id @default(cuid())
  datasetId  String
  dataset    Dataset  @relation(fields: [datasetId], references: [id], onDelete: Cascade)
  doi        String
  repository String   @default("dataverse")
  url        String
  createdAt  DateTime @default(now())
}

model CodeRepository {
  id         String        @id @default(cuid())
  projectId  String?
  project    Project?      @relation(fields: [projectId], references: [id])
  name       String
  gitUrl     String
  mainBranch String @default("main")
  analysisRuns AnalysisRun[]
}

model AnalysisRun {
  id          String        @id @default(cuid())
  repoId      String
  repo        CodeRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)
  commitHash  String
  notebookPath String
  params      String?       // JSON
  status      String        @default("running") // running | completed | failed
  logUrl      String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model Tag {
  id      String   @id @default(cuid())
  label   String   @unique
  papers  Paper[]
}
```

Include AI, MCP, Automation, and ActivityLog models using the same shapes as in the other OSes.[^1]

### EPIC-02-E-02 — Seed Data

Seed a default `Lab`, one `LabMember` PI user, a few sample `SampleType` entries (cell_line, plasmid, antibody, small_molecule), and default `OrgSetting` flags like `eln_enabled`, `jupyter_enabled`, `dataverse_enabled`.

### EPIC-02-V-01 — Validate Schema

- `pnpm prisma validate` exits 0.
- Prisma Studio shows Lab, Project, Experiment, Hypothesis, Sample, Reagent, Paper, Dataset.

***

## EPIC-03: Authentication & Lab Membership

**Goal:** Same NextAuth credentials flow as other OSes, with lab membership and roles determining access to lab-scoped resources.

Implementation is identical to Creator OS EPIC-03 with additional `LabMember` check that ensures a user belongs to a Lab before accessing lab resources.[^1]

***

## EPIC-04: Org Profile & Feature Flags

**Goal:** A research-specific Org/Lab profile controlling which modules appear (ELN, Jupyter, Dataverse, etc.).

Org flags include: `eln_enabled`, `lims_enabled`, `jupyter_enabled`, `dataverse_enabled`, `reference_sync_enabled`, `literature_maps_enabled`.

Behavior: a solo PhD can start with only Projects, Experiments, Papers; a larger lab turns on ELN and Dataverse integration later.[^2][^19]

***

## EPIC-05: Shell UI & Navigation

**Goal:** Sidebar tailored to researcher workflows.

Core groups:

- Dashboard
- Projects
- Experiments
- Samples & Reagents
- Hypotheses
- Literature
- Notebooks
- Data
- AI Assist
- Automation
- MCP
- Settings

Visibility of Experiments, Samples, Notebooks, Data is governed by feature flags and Org settings.

***

## EPIC-06: Research Dashboard

**Goal:** Home screen summarizing:

- Experiments by status (planned/running/complete/failed) this week.
- Projects with upcoming milestones.
- Hypotheses recently updated and their status.
- Newly added papers in collections.
- Recently updated datasets and analysis runs.

All computed from the local DB; this EPIC is analogous to Business OS dashboard but with research-oriented metrics.

***

## EPIC-07: Project & Hypothesis Management

**Goal:** Provide a "project board" with explicit hypotheses, associated experiments, and evidence.

### EPIC-07-E-01 — Project API

- `api/projects` — `GET`, `POST`.
- `api/projects/[id]` — `GET`, `PATCH`, `DELETE`.

### EPIC-07-E-02 — Hypothesis API

- `api/projects/[id]/hypotheses` — `GET`, `POST`.
- `api/hypotheses/[id]` — `GET`, `PATCH`.
- `api/hypotheses/[id]/status` — `POST` to append a `HypothesisStatusChange`.

### EPIC-07-E-03 — UI

Project detail page: three-panel layout — hypotheses list, experiments, and literature (papers and notes).

Each hypothesis has a dedicated page summarizing linked experiments, datasets, and reading notes; AI Assist uses this to generate new experiment ideas.

***

## EPIC-08: Experiments & ELN Bridge

**Goal:** Local experiment registry with deep links into eLabFTW experiments for full ELN detail.[^3][^5][^6][^2]

### EPIC-08-E-01 — Experiment Registry API

- `api/experiments` — `GET` (filter by project, date, status), `POST`.
- `api/experiments/[id]` — `GET`, `PATCH`.

Each `Experiment` record stores `externalElnId` and `status`.

### EPIC-08-E-02 — eLabFTW Integration

`packages/integrations/src/elabftw.ts`:

- `createExperiment(experiment)` — call eLabFTW REST API to create experiment entry; store `externalElnId` and back-link URL.[^4][^26]
- `getExperimentStatus(externalElnId)` — sync status and timestamp back from eLabFTW.

Activation: when `eln_enabled = true`, new experiments auto-create eLabFTW entries; else, Experiment works as a standalone local log.

### EPIC-08-E-03 — Experiments UI

Experiments page: table with filters, quick creation, and badges for linked ELN.

Experiment detail page: metadata at top, quick link "Open in ELN", list of samples consumed/produced, reagents used, instrument booking link.

***

## EPIC-09: Samples, Reagents, and Instruments

**Goal:** Simple LIMS-like module for tracking samples, reagents, storage locations, and instrument bookings.

### EPIC-09-E-01 — Samples & Reagents API

- `api/samples` — `GET`, `POST`.
- `api/samples/[id]` — `GET`, `PATCH`.
- `api/reagents` — `GET`, `POST`.
- `api/reagents/[id]` — `GET`, `PATCH`.

### EPIC-09-E-02 — Instrument Booking API

- `api/instruments` — `GET`, `POST`.
- `api/instruments/[id]/bookings` — `GET`, `POST`.

### EPIC-09-E-03 — UI

- Samples: tree view showing lineage (parent and derived samples), with locations.
- Reagents: table with vendor, catalog, lot, and stock.
- Instruments: calendar view (weekly) of bookings.

***

## EPIC-10: Literature Management (Papers, Collections, Notes)

**Goal:** A first-class literature workspace around Zotero + ResearchRabbit + arXiv/DOI ingestion.[^10][^11][^12][^13][^27][^15][^16][^17][^14]

### EPIC-10-E-01 — Paper Ingestion API

`api/papers/import`:

- Accepts DOIs, arXiv IDs, PubMed IDs, or BibTeX; uses external APIs (Crossref, arXiv) to populate `Paper` fields.

`api/papers` and `api/papers/[id]` implement list/detail.

### EPIC-10-E-02 — Zotero Bridge

`packages/integrations/src/zotero.ts`:

- `syncLibrary()` — fetch items via Zotero Web API and upsert `Paper` entries and `ReadingNote`s created from Zotero annotations.[^11][^10]
- `pushCollection(collection)` — create Zotero collection for a Research OS `PaperCollection`.

### EPIC-10-E-03 — Literature UI

`/literature` route:

- Left: collections (e.g., "thesis intro", "method X", "competing hypotheses").
- Middle: paper list with filters (tag, year, journal).
- Right: reading pane (title, abstract, tags, internal notes).

A "Map" button deep-links to ResearchRabbit using a collection or seed paper; ResearchRabbit handles visualization, while Research OS logs that mapping event for reproducibility.[^15][^17]

***

## EPIC-11: Notebooks & JupyterHub

**Goal:** Integrate with JupyterHub so each Project has associated notebooks and AnalysisRuns that can be tracked and reproduced.[^7][^8][^9]

### EPIC-11-E-01 — JupyterHub Integration

`packages/integrations/src/jupyterhub.ts`:

- `spawnServer(userId)` — call JupyterHub API to spawn or connect to user server.
- `generateNotebookLink(projectId)` — derive URL to a pre-populated notebook template for that project.

### EPIC-11-E-02 — AnalysisRun Tracking

APIs to log an AnalysisRun when a notebook finishes, storing commit hash, parameters, and outputs.

`/notebooks` UI lists recent runs, with links into JupyterLab.

***

## EPIC-12: Data & Dataverse Integration

**Goal:** Manage internal datasets and publish them to Dataverse with DOIs when ready.

### EPIC-12-E-01 — Dataset API

- `api/datasets` — `GET`, `POST`.
- `api/datasets/[id]` — `GET`, `PATCH`.
- `api/datasets/[id]/versions` — `GET`, `POST` (add dataset version with storage path).

### EPIC-12-E-02 — Dataverse Bridge

`packages/integrations/src/dataverse.ts`:

- `publishDataset(datasetId)` — package latest version and metadata, call Dataverse API, create `DatasetPublication` with DOI and URL.[^18][^20][^21][^19]

### EPIC-12-E-03 — Data UI

`/data` route shows datasets with field tags (genomics, imaging, survey, etc.) and publication status.

***

## EPIC-13: Research AI Assistant

**Goal:** A PhD-level AI copilot that is **grounded** in:

- Local hypotheses, experiments, and datasets.
- Local literature (Papers, ReadingNotes).
- External arXiv/DOI lookups when allowed.

### EPIC-13-E-01 — Org-Aware System Prompt

System prompt includes:

- Lab name, field, typical modalities (wet lab, computational, both).
- Active projects and their hypotheses.
- Preferential use of **cited papers and local notes**; AI should always suggest explicit follow-up experiments and analyses.

### EPIC-13-E-02 — MCP Tools for Research

`packages/mcp-server/src/tools/research-tools.ts`:

- `suggest_hypotheses(projectId)` — uses project description, hypotheses, and papers to propose new testable hypotheses.
- `design_experiments(hypothesisId)` — outputs candidate experimental designs, with variables, controls, and predicted outcomes.
- `summarize_paper(paperId)` — summarises paper and links to relevant hypotheses.
- `map_literature(topic)` — given a query or seed papers, imports key papers and builds a `PaperCollection`.
- `suggest_analysis(datasetId)` — suggests appropriate statistical or computational analyses given dataset metadata.
- `find_relevant_data(hypothesisId)` — surfaces datasets linked to that hypothesis.

***

## EPIC-14: Automation (n8n) — Research Workflows

**Goal:** Automate repetitive glue work: new paper imports, data publishing, notifications, recurring analyses.

Example flows in `AUTOMATION_EXAMPLES.md`:

- ArXiv RSS feed → `api/papers/import` → notify PI of new relevant papers.
- Completed experiment in eLabFTW → create Dataset stub and Jupyter notebook task.[^26][^4]
- Completed AnalysisRun with success → create `DatasetVersion` and prompt Dataverse publication.

***

## EPIC-15: MCP Client & CLI (research-cli)

**Goal:** CLI to manage projects, experiments, and literature.

Example commands:

```bash
research-cli project:create "Single-cell profiling of X"
research-cli hypothesis:create proj_123 "X increases Y in condition Z"
research-cli lit:import --doi 10.1038/s41586-020-00000
research-cli lit:map --collection coll_abc
research-cli exp:create proj_123 "Test X perturbation" --eln
research-cli data:publish ds_456
research-cli ai:ask "What experiments would you run next for hypothesis H?"
```

The CLI uses MCP tools where possible, mirroring Creator/Business OS patterns.[^1]

***

## EPIC-16: Containerization & Co‑Process Layout

**Goal:** Single Docker image orchestrating Research OS + eLabFTW + JupyterHub + Dataverse (or remote Dataverse) + n8n, with feature-flagged co-processes.

Process inventory mirrors Business OS but replaces CRM/Invoice stack with ELN/Jupyter/Dataverse.

- eLabFTW can be self-hosted or institution-hosted; integration is via API URL.[^5][^4][^2]
- JupyterHub runs either inside the same cluster or externally; Research OS uses its REST API + notebook URLs.[^8][^9]
- Dataverse is typically external; integration is via its REST API and published DOIs.[^20][^21][^19]

***

## Scale-Up Path: From Solo PhD to Multi-Lab Consortium

- **Solo PhD:** Only Projects, Experiments registry, Papers, Hypotheses, Jupyter notebooks; eLabFTW and Dataverse optional.
- **Single PI Lab:** Turn on ELN and inventory; require Lab membership; start using Dataverse for open data.
- **Department / Program:** JupyterHub and Dataverse centralised; multiple Labs defined; Research OS instance becomes the "OS" over them.
- **Consortium:** Research OS speaks to multiple Dataverse instances; projects span labs; MCP tools include custom HPC scheduler, EHR or LIMS integrations.

Throughout, schema and core app stay stable — only co-process topology and feature flags change, mirroring the extensible approach used in Maker OS and Business OS.[^9][^21][^4][^7][^19][^2]

---

## References

1. [Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/399744584/abd6ec54-7f74-4389-aec4-b0a0b60ab632/Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md?AWSAccessKeyId=ASIA2F3EMEYE4Q4VOQLZ&Signature=QhkGX4SBmliI7evT5%2BA%2F%2Bm0fSF4%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEMb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIQCQoGihA8lk1ICleb%2FB%2B9MgvGdqIlSx0HhY8m5tTkXWTAIgI%2BzW6j1o0wfCwFCPrHGeADQ6ePN3vI9qjs5PgTlHDvYq%2FAQIj%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDEWB8YL4mzjLDewvlSrQBKyOitDtV8q0A2iP7m1eXNBeXugE%2FTQZnygFRSLCF3SDo6KoC8K%2FcBVr9BAibKqXDRAXx6c%2Bj%2B4k%2FlJXnf6QShtQyo25JnGeAxlXpYKJGVkvy7tMHU8baEBMFciU1PuCfJxZAklYj6B86u7Y4YC9i6ELxIdUg6d6r8%2FUkky4P%2FcwUeYSP54cs4dSgAdNfnGhXnGM3Zj8HtwUXaTWOj55tmrvuWyiS85oO923OAM%2Bio7jjazZMo3UCid6pE%2F28D%2BDSy0WALJy33QpioKIP1u6VFsJzeaMdiySuZTjSKCVKmh6eWkN83MK5SCd44Ncm6OdlF8PJ9vQ43%2B0YywDuwAHmVERvpLLPb7Hf7l5C53W%2FRf29cpnncJDxoqWNF6LJVUVMo8IMR33khHk9svGMd18bCe4U8maiEiann03rO5ofV3fxNOcKWg6T5OJHG9wQcYsbXPj2dWDQYyK8QAcR3uZKgteJjEkyFxos7TrshUlQhkJEDT3RHykDzSiHBsdMXOihUm94K9NpdFaatUAzOhV%2BXJ92r9kXilTx279Qeb0R2690uGows3JW4kSP2reovxgYsCaUedcJO9a5GcLymmAbDzmubhoVzL64FbDThfxf5zWB6L2CwYTlQ9T%2FRNctLdnIPqLYH153pvqLLIKkDTnAzCnbm%2F6VIMZ8Z8%2FG1zdaBzw0TkYLS5JFlpwHjAdiW4SLBp7IkYWQP%2FuPnVb7zbDGARfteC%2FaqFrILi6lKPBcXbFdmJlDddUSzPgB3hf1txBIikvoPwnqg2Rm0D1o%2FXZ2fYwnMvpzwY6mAEN%2FSVJK1IWvlhy6OiZNJiKoHeihb0QELlQZj3TPtFk0CdL6le2F3V1lxIJ1Q8X2RQwT%2FtDtlv6F%2FDzqq4em7KRWK11BKv0r8hsP%2BpCDTDDxuEF69eE71YPoQCb8DoB%2F3VPuexYNozh3Qyt6SkMehwvQ2nu8MBo6hS3gLEUEQMYBdRkIP1akMFlr587RQLuizfb6XpO0nzZgw%3D%3D&Expires=1778021231) - Every ticket follows EPIC-XX-APEV-NN where A Assess, P Plan, E Execute, V Validate. Epics are indepe...

2. [eLabFTW - free open source ELN](https://www.elabftw.net) - An electronic laboratory notebook. Store experiments and protocols in eLabFTW. Sign and timestamp en...

3. [eLabFTW is the most popular open source electronic lab ...](https://github.com/elabftw/elabftw) - eLabFTW is an electronic lab notebook manager for research teams. It lets you store and organize you...

4. [Pilot Service for the Electronic Lab Notebook "eLabFTW"](https://www.iimc.kyoto-u.ac.jp/en/info/20251223133443) - The electronic lab notebook "eLabFTW" is open-source software that originated in a laboratory in Fra...

5. [eLabFTW download](https://sourceforge.net/projects/elabftw.mirror/) - eLabFTW is a modern, open-source electronic laboratory notebook (ELN) that helps research teams stor...

6. [Top 10 Electronic Lab Notebooks (ELN) of 2025](https://blogs.labii.com/others/top-10-electronic-lab-notebooks-eln-of-2025-streamline-your-research-with-integrated-inventory) - 8. eLabFTW. eLabFTW is a free, open-source ELN that offers features for experiment documentation, in...

7. [JupyterHub](https://docs.alliancecan.ca/wiki/JupyterHub) - JupyterHub is the best way to serve Jupyter Notebook for multiple users. It can be used in a class o...

8. [JupyterHub — JupyterHub documentation](https://jupyterhub.readthedocs.io) - It is a multi-user Hub that spawns, manages, and proxies multiple instances of the single-user Jupyt...

9. [Project Jupyter | JupyterHub](https://jupyter.org/hub) - JupyterHub brings the power of notebooks to groups of users. It gives users access to computational ...

10. [Zotero Reference Management — Complete Guide for ...](https://news.europub.co.uk/zotero-reference-management-complete-guide-for-researchers-editors-and-students/) - Zotero is a powerful, open-source reference manager that helps researchers collect, organize, cite, ...

11. [Trusted AI reference and citation management tools](https://anara.com/blog/reference-management-tools) - Zotero is a free, open-source reference manager that helps users collect, organize, cite, and share ...

12. [Zotero vs Mendeley: Which reference manager is better?](https://paperpile.com/r/zotero-vs-mendeley/) - Zotero an open-source reference management tool, enables users to gather, organize, and cite researc...

13. [Zotero Review 2025: The Best Free Research Tool for ...](https://sites.google.com/view/aitoolfree/zotero-review) - Zotero is a free, open-source reference manager developed by the Center for History and New Media at...

14. [ResearchRabbit: AI Tool for Smarter, Faster Literature Reviews](https://www.researchrabbit.ai) - Save hours on your literature review. Use ResearchRabbit to find related papers, build citation maps...

15. [AI for Literature Reviews: Map Research - Library Guides](https://libguides.tulane.edu/c.php?g=1368318&p=10109584) - Research Rabbit lets users discover publications related to one or more seed publications with the h...

16. [Tool Demo–ResearchRabbit: An AI-Driven ...](https://thepeerreview-iwca.org/issues/issue-9-1/tool-demo-researchrabbit-an-ai-driven-tool-for-literature-mapping/) - ResearchRabbit offers a unique approach to literature mapping and citation management that can enhan...

17. [Streamlining Your Literature Review Workflow with ...](https://www.choice360.org/libtech-insight/streamlining-your-literature-review-workflow-with-researchrabbit/) - ResearchRabbit is an AI tool designed to help researchers visualize connections between existing res...

18. [USC Dataverse Launches to Support Open Research and ...](https://itservices.usc.edu/2025/11/13/usc-dataverse-launches-to-support-open-research-and-data-sharing/) - The USC Dataverse, built on the open-source Dataverse Project, is designed to increase the visibilit...

19. [The Dataverse Project - Dataverse.org | The Dataverse Project](https://dataverse.org) - The Dataverse Project - Dataverse.org. Open source research data repository software. psychology. Re...

20. [IQSS/dataverse: Open source research data repository ...](https://github.com/IQSS/dataverse) - Welcome to Dataverse®, the open source software platform designed for sharing, finding, citing, and ...

21. [About](https://dataverse.org/about) - The Dataverse Project is an open source web application to share, preserve, cite, explore, and analy...

22. [Top Benchling Alternatives for Labs That Need More Than ...](https://genemod.net/blog/top-benchling-alternatives-for-labs-that-need-more-than-flexibility) - Benchling gives labs flexibility—but flexibility without structure can quietly become a liability. H...

23. [The Top 9 Benchling Alternatives](https://qbench.com/blog/the-top-9-benchling-alternatives) - Evaluating LIMS options? This in-depth review highlights the top alternative to Benchling and why la...

24. [Best Benchling competitors alternatives - newLab®](https://newlabcloud.com/blog/best-benchling-competitors-alternatives/) - Explore top Benchling alternatives like Labguru & LabArchives, how connects your entire lab ecosyste...

25. [Step-by-Step Guide to Using ResearchRabbit](https://www.researchrabbit.ai/articles/guide-to-using-researchrabbit) - Unlike traditional academic search tools, ResearchRabbit doesn't just return a list of results. It h...

26. [eLabFTW integration](https://galaxyproject.org/news/2025-04-02-elabftw-integration/) - eLabFTW is a free and open source electronic lab notebook from Deltablot. It can keep track of exper...

27. [Litmaps vs ResearchRabbit vs Connected Papers: Best Lit ...](https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025/) - Here, we compare the three most popular tools for visualising papers and doing literature review: Li...

