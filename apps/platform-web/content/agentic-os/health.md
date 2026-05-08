# Health OS — Full Execution Plan v2 (Physical + Mental Wellness)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, mirroring your other OS plans.[^1]
Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete.
Execute tickets include concrete file paths, package names, and commands; Validate tickets include pass/fail criteria an automated agent can evaluate.

***

## Critical Standing Rules (Apply to Every EPIC and Every AI Output)

These rules are **non-negotiable** and enforced at the system-prompt, schema, and output-rendering level:

1. Health OS is **not** a licensed medical, psychiatric, or clinical professional.
2. It must **never** diagnose, treat, prescribe medications, or override professional medical or mental health advice.
3. All numeric targets, ranges, and suggestions must cite their source (guideline, screener, or data record), never be invented.[^2][^3][^4][^5][^6][^7][^8][^9][^10][^11][^12][^13][^14][^15][^16][^17][^18]
4. Every plan, recommendation, and AI response must include a visible **caveat block** — "These suggestions are based on public guidelines for generally healthy adults and your profile; they are **not medical advice**. Please review with your doctor, licensed therapist, or clinician before making changes."
5. **Crisis safety wall**: If the user expresses suicidal ideation, self-harm, or a mental health emergency, the system must immediately surface crisis resources (988 Suicide & Crisis Lifeline; Crisis Text Line: TEXT HOME to 741741) and stop all other plan-generation behavior.[^6]
6. PHQ-9, GAD-7, and PSS scores are for **self-awareness tracking** only. Any score that meets the clinical threshold for moderate-severe distress triggers a referral prompt — not a diagnosis.[^7][^6]
7. No hallucinated facts. All nutritional data must come from USDA FoodData Central; all activity and mental health guidance from named published guidelines.

***

## Frozen Tech Stack (All Tickets Assume This)

Same base as all other OSes.[^1]

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

***

### Physical Health Co‑Processes

| Function | Default Tool | License | Notes |
|---|---|---|---|
| Nutrition data | USDA FoodData Central API / local mirror | CC0 | 300k+ foods with full nutrient profiles.[^19][^20][^21][^22] |
| Nutrition API wrapper | fdc-api | MIT | REST wrapper around FoodData Central.[^23] |
| Fitness & food logging | wger / SparkyFitness | GPL / MIT | Self-hosted workout + nutrition + body metrics.[^24][^25][^26] |
| Endurance tracking | Endurain | OSS | Self-hosted Strava-like for runs/rides.[^27] |
| Personal health record | HAPI FHIR / Microsoft FHIR Server | Apache-2.0 | FHIR-compliant PHR/PFR backend.[^28][^29][^30] |

### Mental Health Co‑Processes

| Function | Default Tool | License | Notes |
|---|---|---|---|
| Mood tracking & journaling | MoodMo | MIT | Self-hosted mood tracking + journaling, CSV/JSON export, full-text search.[^31][^32] |
| General self-tracking | Perfice | OSS | Self-hosted app for tracking any health metric (mood, energy, sleep, etc.) with pattern analysis.[^33] |
| Meditation | Medito (API) | GPL 3.0 | 100% free, nonprofit, open-source; guided meditations, breathing exercises, sleep sessions.[^34][^35][^36][^37][^38] |
| Screeners | PHQ-9, GAD-7, PSS | Public domain | Validated public-domain instruments for depression, anxiety, and stress. Embedded as internal questionnaires only.[^6][^39][^7] |
| Guided self-help framework | Evidence-based CBT self-help | Evidence-based | NHS/VA-aligned CBT-derived self-help content; not therapy replacement.[^2][^3][^4][^5] |

### Shared
| Automation | n8n | Fair-code | Reminders, integrations, daily check-ins. |

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** `~/health-os/` Turborepo with standard package layout and `@health-os/*` prefixes.

(Identical in structure to prior OS EPICs-01; only names change.)[^1]

***

## EPIC-02: Expanded Health Data Schema (Prisma)

**Goal:** A schema for the full wellness profile: physical health, mental health, mood, screener history, meditation, CBT journaling, and all integration sources.

### EPIC-02-A-01 — Full Entity Audit

`packages/db/ENTITIES.md`:

```text
// Shared
User, Session, Account (NextAuth)
OrgSetting (feature flags for all modules)

// Identity & Profile
HealthProfile (demographics, activity level, preferences)

// Physical Health
Condition (chronic conditions)
Medication (current meds/supplements)
Allergy (food or drug)
InjuryOrLimitation (movement limitations)
ClinicianNote (user-uploaded doctor/PT notes)
Goal (physical goals: weight, cardio, strength, etc.)
RiskFlag (auto-generated safety flags)
Metric (time-series: weight, BP, HR, HRV, steps, sleep hours)
TrackerSource (wger/Endurain/FHIR/etc. config)
ActivityPlan (weekly activity structure)
ActivitySession (executed workout)
ExerciseTemplate (movement library)
MealPlan
Meal
MealItem
FoodRef (USDA FDC IDs + cached nutrients)
Recipe
RecipeIngredient
ShoppingList

// Mental Health
MentalHealthProfile (self-reported mental health context)
MentalHealthGoal (goals: reduce anxiety, sleep quality, stress resilience)
MoodEntry (single mood/energy/sleep log)
MoodTag (label associated with a mood: work, family, exercise, etc.)
JournalEntry (free-text reflective journal, linked to MoodEntry optionally)
JournalPrompt (structured reflection prompts)
ScreenerResult (PHQ-9, GAD-7, PSS scores and timestamps)
ScreenerItem (raw Q/A for each screener)
MeditationSession (completed meditation: duration, type, source)
MeditationPlan (suggested practice schedule)
CBTExercise (structured CBT-derived self-help exercises)
CBTExerciseLog (completed CBT exercises with notes)
CrisisEvent (timestamp of when crisis wall was triggered; no clinical content stored)

// AI & Automation
CaveatLog (records every deferral-to-clinician event)
AIConversation, AIMessage
MCPServerConfig
AutomationTrigger, AutomationLog
ActivityLog
```

### EPIC-02-P-01 — Relationship Design

`packages/db/SCHEMA_PLAN.md`:

**Physical side** (unchanged from v1):
- `HealthProfile` 1→N `Condition`, `Medication`, `Allergy`, `InjuryOrLimitation`, `RiskFlag`, `Goal`.
- `MealItem` → `FoodRef` → USDA FDC lookup.
- `ActivityPlan` → `ActivitySession` → `ExerciseTemplate`.

**Mental health side**:
- `MentalHealthProfile` 1→1 `HealthProfile` (extension); has fields: current_stress_level (low/medium/high), sleep_quality, self_reported_focus, support_network (none/some/strong), currently_in_therapy (bool).
- `MoodEntry` 1→N `MoodTag`, 0→1 `JournalEntry`.
- `ScreenerResult` belongs to `MentalHealthProfile`; contains `screenerType` (phq9 | gad7 | pss), `score`, `cutoffFlag` (bool: score met clinical threshold), `referralShown` (bool: whether referral was displayed).[^6][^7]
- `ScreenerItem` stores each Q/A for audit/trend use.
- `MeditationSession` linked to source (`medito | custom | manual`); stores `durationSeconds`, `kind` (guided | breathing | body scan | sleep).
- `CBTExercise` stores exercise type (thought_record | behavioral_activation | worry_time | grounding_5_4_3_2_1 | gratitude | values_clarification), instructions, and source (NHS/VA reference).[^2][^4]
- `CrisisEvent` is **write-only** from the system; logs timestamp only — no clinical content is stored.

### EPIC-02-E-01 — Implement Schema

Full Prisma models including new mental health entities:

```prisma
model MentalHealthProfile {
  id                 String   @id @default(cuid())
  healthProfileId    String   @unique
  healthProfile      HealthProfile @relation(fields: [healthProfileId], references: [id])
  currentStressLevel String   @default("medium") // low | medium | high
  sleepQuality       String   @default("fair")   // poor | fair | good
  selfReportedFocus  String   @default("fair")
  supportNetwork     String   @default("some")   // none | some | strong
  currentlyInTherapy Boolean  @default(false)
  therapyType        String?
  goals              MentalHealthGoal[]
  moodEntries        MoodEntry[]
  screenerResults    ScreenerResult[]
  meditationSessions MeditationSession[]
  meditationPlans    MeditationPlan[]
  cbtLogs            CBTExerciseLog[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model MentalHealthGoal {
  id          String              @id @default(cuid())
  profileId   String
  profile     MentalHealthProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  kind        String              // anxiety | depression_mood | stress | sleep | focus | resilience | social
  description String?
  status      String              @default("active")
  createdAt   DateTime            @default(now())
}

model MoodEntry {
  id          String              @id @default(cuid())
  profileId   String
  profile     MentalHealthProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  loggedAt    DateTime            @default(now())
  mood        Int                 // 1-10 scale
  energy      Int?                // 1-10 scale
  anxiety     Int?                // 1-10 scale
  sleepHours  Float?
  note        String?
  tags        MoodTag[]
  journal     JournalEntry?
}

model MoodTag {
  id      String     @id @default(cuid())
  label   String     @unique
  entries MoodEntry[]
}

model JournalEntry {
  id          String       @id @default(cuid())
  moodEntryId String?      @unique
  moodEntry   MoodEntry?   @relation(fields: [moodEntryId], references: [id])
  promptId    String?
  prompt      JournalPrompt? @relation(fields: [promptId], references: [id])
  text        String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model JournalPrompt {
  id        String         @id @default(cuid())
  text      String
  kind      String         @default("general") // general | cbt | gratitude | values | behavioral
  source    String?
  entries   JournalEntry[]
}

model ScreenerResult {
  id           String              @id @default(cuid())
  profileId    String
  profile      MentalHealthProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  screenerType String              // phq9 | gad7 | pss
  score        Int
  cutoffFlag   Boolean             @default(false)
  referralShown Boolean            @default(false)
  takenAt      DateTime            @default(now())
  items        ScreenerItem[]
}

model ScreenerItem {
  id        String         @id @default(cuid())
  resultId  String
  result    ScreenerResult @relation(fields: [resultId], references: [id], onDelete: Cascade)
  question  String
  response  Int
}

model MeditationSession {
  id          String              @id @default(cuid())
  profileId   String
  profile     MentalHealthProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  source      String              @default("medito") // medito | custom | manual
  kind        String              @default("guided") // guided | breathing | body_scan | sleep | unguided
  durationSec Int
  completedAt DateTime            @default(now())
  notes       String?
}

model MeditationPlan {
  id          String              @id @default(cuid())
  profileId   String
  profile     MentalHealthProfile @relation(fields: [profileId], references: [id])
  sessionsPerWeek Int             @default(3)
  minutesPerSession Int           @default(10)
  kind        String              @default("mixed")
  startDate   DateTime            @default(now())
}

model CBTExercise {
  id           String           @id @default(cuid())
  name         String
  kind         String           // thought_record | behavioral_activation | worry_time | grounding | gratitude | values
  instructions String
  source       String?          // e.g. "NHS Every Mind Matters" or "VA CBT Manual"
  logs         CBTExerciseLog[]
}

model CBTExerciseLog {
  id           String              @id @default(cuid())
  profileId    String
  profile      MentalHealthProfile @relation(fields: [profileId], references: [id])
  exerciseId   String
  exercise     CBTExercise         @relation(fields: [exerciseId], references: [id])
  notes        String?
  completedAt  DateTime            @default(now())
}

model CrisisEvent {
  id         String   @id @default(cuid())
  triggeredAt DateTime @default(now())
  // no clinical content stored
}
```

### EPIC-02-E-02 — Seed Defaults

- Default `MentalHealthProfile` for all users.
- Seed `JournalPrompt` library (CBT thought records, gratitude, values).[^4][^2]
- Seed `CBTExercise` records based on NHS Every Mind Matters and VA CBT manual references.[^2][^4]
- Seed `OrgSetting` flags: `mood_tracking_enabled`, `screeners_enabled`, `meditation_enabled`, `cbt_tools_enabled`, `mental_health_coaching_enabled`.

### EPIC-02-V-01 — Validate Schema

- `pnpm prisma validate` passes.
- Confirm MoodEntry → JournalEntry → CBTExerciseLog chain resolves correctly in Prisma Studio.

***

## EPIC-03: Privacy, Consent & Safety Layer (Updated)

**Goal:** Enforce informed consent, data minimization, a mental health safety wall, and explicit disclaimers everywhere.

### EPIC-03-E-01 — Consent Flow (Extended)

Consent wizard now separately asks permission for:

1. Physical health data use (physical plans and nutrition).
2. Mental health data use (mood logs, screeners, CBT tool use) — explicitly explained as personal tracking, not clinical care.

Both consent records stored in `OrgSetting` with timestamp.

### EPIC-03-E-02 — Crisis Safety Wall

Implemented as a **middleware-level content classifier** that runs on ALL user input before any AI processing:

```ts
// apps/web/src/lib/crisis-wall.ts
const CRISIS_PHRASES = [
  "want to kill myself", "end my life", "suicidal", "don't want to be here",
  "self harm", "hurt myself", "not worth living", "no reason to live"
]

export function checkCrisisSignal(text: string): boolean {
  const lower = text.toLowerCase()
  return CRISIS_PHRASES.some(p => lower.includes(p))
}

export const CRISIS_RESPONSE = `
⚠️ It sounds like you may be going through something very difficult.
If you are in crisis or thinking about harming yourself, please reach out now:

📞 **988 Suicide & Crisis Lifeline** — call or text **988** (US)
💬 **Crisis Text Line** — text HOME to **741741**
🌐 **International Association for Suicide Prevention** — https://www.iasp.info/resources/Crisis_Centres/

Please talk to a mental health professional or go to your nearest emergency room.
`
```

- If triggered: store `CrisisEvent` timestamp, display `CRISIS_RESPONSE`, halt all planning activity.
- If PHQ-9 Question 9 ("thoughts of hurting yourself") is answered ≥ 1, always trigger wall independently.[^6]

### EPIC-03-E-03 — Screener Threshold Referral Logic

- PHQ-9 ≥ 10 → moderate-severe depression threshold → show referral prompt and flag `RiskFlag.kind = "moderate_depression"`. Not a diagnosis.[^7][^6]
- GAD-7 ≥ 10 → moderate-severe anxiety threshold → referral prompt.[^7]
- PSS ≥ 27 → high perceived stress → referral prompt.
- Referral prompt reads: "Your score suggests this might be a good time to speak with a licensed mental health professional. Here are some ways to find support: [SAMHSA locator link, Psychology Today link]."
- No diagnosis language used.

### EPIC-03-V-01 — Validate Safety Layer

- PHQ-9 input with Q9 = 1 → crisis wall triggers.
- PHQ-9 score = 15 → referral prompt appears, no plan generated for that session.
- Crisis phrase in coaching chat → crisis wall triggers immediately.

***

## EPIC-04: Health Data Integrations (PHR, Trackers, Mood Apps)

**Goal:** Import physical and mental health data from external sources.

### EPIC-04-E-01 — Physical Integrations (Unchanged)

FHIR PHR import and wger/Endurain fitness tracker sync as in v1.[^24][^28][^27][^29][^25][^30][^26]

### EPIC-04-E-02 — Mental Health Data Sync

`packages/integrations/src/mental-health.ts`:

- `syncMoodMo(trackerSourceId)` — pull MoodMo entries via REST API into `MoodEntry` and `JournalEntry`.[^31][^32]
- `syncPerfice(trackerSourceId)` — pull custom tracked metrics into `MoodEntry` and `Metric`.[^33]
- `syncMeditationFromMedito(trackerSourceId)` — pull Medito session logs via API into `MeditationSession`.[^34][^35][^36][^37]

### EPIC-04-V-01 — Validate Integrations

- Connect demo MoodMo instance and confirm MoodEntry records populate in Health OS.

***

## EPIC-05: Evidence-Based Guideline Knowledge Base (Physical + Mental)

**Goal:** Encode both physical activity/nutrition guidelines and mental health self-help evidence into a queryable structure.

### EPIC-05-E-01 — Physical Guidelines

Identical to v1: AHA/ACSM/HHS activity ranges (150–300 min/week moderate or 75–150 vigorous + ≥2 days strength + flexibility/balance) and DGA 2025–2030 nutrition principles.[^8][^9][^10][^11][^12][^13][^14][^15][^16][^17][^18]

### EPIC-05-E-02 — Mental Health Self-Help Evidence Base

Encode evidence-based **non-clinical** self-help interventions; store in a `SelfHelpEvidence` config that AI can query:

| Approach | Target | Evidence Level | Source |
|---|---|---|---|
| Mindfulness meditation (8+ weeks) | Stress, anxiety, mood | Strong | MBSR research; NHS; Medito clinical references |
| Regular moderate exercise | Depression, anxiety, stress, sleep | Strong | HHS guidelines; ACSM position stand |
| CBT thought records | Anxiety, low mood | Strong | NHS Every Mind Matters; VA CBT Manual |
| Behavioral activation | Low mood, depression-like symptoms | Strong | VA CBT Manual; research review |
| Worry time scheduling | Anxiety | Moderate–Strong | CBT evidence base |
| Sleep hygiene practices | Sleep, mood, energy | Moderate–Strong | NHS; CDC sleep guidance |
| Social engagement | Mood, resilience | Moderate | General wellbeing literature |
| Gratitude journaling | General wellbeing | Moderate | Positive psychology literature |
| Grounding techniques (5-4-3-2-1) | Acute anxiety | Moderate | CBT evidence base |

Each item has a `caveatText` (e.g., "These activities support wellbeing but do not replace professional treatment for clinical conditions.") and a `notForConditions` list (e.g., severe depression, PTSD → professional care needed).[^3][^5][^4][^2]

### EPIC-05-V-01 — Validate Knowledge Base

- `getSafeRanges()` returns physical activity ranges and applicable mental health self-help approaches for the profile.

***

## EPIC-06: Conversational Intake & Goal Setting (Physical + Mental)

**Goal:** Expanded intake that gathers physical and mental wellbeing context.

### EPIC-06-E-01 — Intake Wizard (Extended)

Intake now has two phases:

**Phase 1 — Physical** (unchanged): conditions, medications, injuries, activity level, diet, physical goals.

**Phase 2 — Mental Wellbeing** (new):
- "How would you describe your current stress level most days?" (low / medium / high)
- "How is your sleep quality generally?" (poor / fair / good)
- "Are you currently working with a therapist or counselor?" (yes / no / prefer not to say)
- "Which areas of mental wellbeing are you most interested in supporting?" (stress, anxiety, mood, sleep, focus, resilience)
- Optional: complete a brief PHQ-9 and GAD-7 now to establish a baseline.[^6][^7]

### EPIC-06-E-02 — RiskFlag Engine (Extended)

- BMI in high range → physical risk flag (existing).
- PHQ-9 ≥ 10 or GAD-7 ≥ 10 at intake → `RiskFlag.kind = "moderate_depression_screen"` or `"moderate_anxiety_screen"` → immediately show referral prompt.[^6][^7]
- Self-reported high stress + poor sleep + no support network → `RiskFlag.kind = "high_stress_cluster"` → suggest lower-intensity CBT and meditation first.

### EPIC-06-V-01 — Validate Intake

- Run full intake; mental health phase creates MentalHealthProfile and one ScreenerResult.

***

## EPIC-07: Physical Activity Planning (Unchanged from v1)

Identical to v1 — ActivityPlan builder within AHA/ACSM/HHS ranges.[^9][^11][^13][^14][^16]

Key addition: activity plans now **cross-reference mental health goals**, noting evidence-based physical activity benefits for mood, anxiety, and stress where appropriate.[^11][^13][^14][^16][^9]

***

## EPIC-08: Nutrition Planning & Meal Plans (Unchanged from v1)

Identical to v1 — USDA FoodData Central as data source; DGA 2025-2030 principles; chef/prep module.[^19][^20][^21][^22][^12][^15][^18]

***

## EPIC-09: Mental Health Tracking & Screeners

**Goal:** Track mood, energy, anxiety, and sleep over time; run periodic screeners; visualize trends.

### EPIC-09-E-01 — Daily Mood Check-In

`/mental/mood`:

- Simple form: mood slider (1–10), energy (1–10), anxiety (1–10), sleep hours, mood tags, and optional journal prompt.
- Submitted as `MoodEntry` + optional `JournalEntry`.
- Runs crisis wall check on journal text before saving.

### EPIC-09-E-02 — Screeners (PHQ-9, GAD-7, PSS)

`/mental/screeners`:

- Weekly or biweekly prompts to complete a screener.
- PHQ-9 (9 items, 0–27), GAD-7 (7 items, 0–21), PSS (10 items, 0–40) — all public domain.[^39][^7][^6]
- After completion: display score with non-clinical interpretation (e.g., "Your score suggests mild symptoms. This tool is for self-awareness, not diagnosis.").
- If threshold met (PHQ-9 ≥ 10, GAD-7 ≥ 10): show referral prompt (SAMHSA locator).[^7][^6]
- All results stored in `ScreenerResult` with timestamp for trend charting.

### EPIC-09-E-03 — Mood & Screener Trend UI

`/mental/trends`:

- Line charts for mood, energy, anxiety, sleep over last 30/90 days.
- Screener score history showing change over time.
- Tags heatmap showing which conditions (work, exercise, social) correlate with mood patterns.

### EPIC-09-V-01 — Validate Screening & Tracking

- Complete PHQ-9 with score 12 → referral prompt appears; no clinical language.
- 30 MoodEntry records → trend charts render correctly.

***

## EPIC-10: Mindfulness & Meditation Module

**Goal:** A structured meditation practice built around Medito's free content with custom scheduling.

### EPIC-10-E-01 — Medito Integration

`packages/integrations/src/medito.ts`:

- Browse Medito content via their API (sessions, courses, breathing, sleep) and display within Health OS.[^35][^36][^37][^34]

### EPIC-10-E-02 — MeditationPlan Generator

MCP tool `generate_meditation_plan(profileId)`:

- Suggests 3–5 sessions/week, 5–20 min each, starting with beginner/breathing sessions.
- Recommends variety: guided, body scan, breathing, sleep meditation.
- Bases suggestions on MentalHealthGoal (e.g., anxiety → breathing + body scan; sleep → sleep stories; stress → MBSR-style sessions).

### EPIC-10-E-03 — Meditation UI

`/mental/meditate`:

- Today's session with "Start" button.
- Weekly calendar with completed (green) and planned sessions.
- Streak counter and trend data.

### EPIC-10-V-01 — Validate Meditation Module

- Meditation plan generates appropriate sessions for anxiety goal.
- Completing a session logs `MeditationSession`.

***

## EPIC-11: CBT-Inspired Self-Help Tools

**Goal:** Offer evidence-based CBT self-help exercises, clearly presented as supportive tools and not as professional therapy.[^5][^3][^4][^2]

### EPIC-11-A-01 — Identify CBT Exercises

Supported exercises (from NHS Every Mind Matters and VA CBT Manual sources):[^4][^2]

- **Thought Record (Cognitive Restructuring)** — identify, challenge, and reframe unhelpful thoughts.
- **Behavioral Activation** — schedule activities that give a sense of achievement and pleasure.
- **Worry Time** — contain worry to one scheduled 15-minute period per day.
- **5-4-3-2-1 Grounding** — sensory grounding for acute anxiety.
- **Gratitude Journal** — record 3 things you're grateful for.
- **Values Clarification** — identify what matters most as a guide for goal-setting.
- **Sleep Hygiene Checklist** — evidence-based sleep practice list.[^2][^4]

### EPIC-11-E-01 — CBT Tool UI

`/mental/tools`:

- List of available exercises with description, source citation, and estimated time.
- Each exercise links to a guided walkthrough screen.
- Completion is logged in `CBTExerciseLog`.

### EPIC-11-E-02 — CBT-Informed Journal Prompts

- Automatically surface relevant prompts based on recent mood trends (e.g., multiple low mood entries → suggest thought record prompt).

### EPIC-11-V-01 — Validate CBT Tools

- Complete a thought record exercise; log saves to CBTExerciseLog.
- Source citations displayed for each exercise.

***

## EPIC-12: Integrated Lifestyle Programs (Physical + Mental)

**Goal:** Combine physical plans, nutrition, meditation, mood tracking, and CBT tools into a coherent weekly program.

### EPIC-12-E-01 — Program Model

`Program` entity: links ActivityPlan, MealPlan, MeditationPlan, and habit checklist.

### EPIC-12-E-02 — Holistic Program Generator

MCP tool `generate_holistic_program(profileId)`:

- Integrates physical and mental health goals.
- Example output for "reduce anxiety and improve energy":
  - 3 moderate cardio sessions/week (evidence: anxiety/mood benefit).[^13][^14][^16][^11]
  - 1 strength session.
  - 4 meditation sessions/week (guided + breathing focus).
  - Daily mood check-in.
  - 2 CBT thought records/week.
  - Meal plan prioritizing real food; moderate caffeine (anxiety note).
  - 1 behavioral activation activity scheduled.

- Caveats for each mental health component: "These activities are supportive but do not replace professional care."

### EPIC-12-V-01 — Validate Programs

- Generated program balances physical and mental components.

***

## EPIC-13: Daily & Weekly Coaching (Physical + Mental)

**Goal:** Day-to-day AI coach covering both physical movement and mental wellbeing.

### EPIC-13-E-01 — Daily Check-in Coaching

`/coach`:

- Morning prompt: "How did you sleep? Any sessions done today?"
- Evening prompt: "What's your mood like? Would you like a 5-min breathing session or to write a few thoughts?"

### EPIC-13-E-02 — Weekly Review

- Summarizes mood trend, meditation sessions, activity, and meals.
- Notes correlations the user can observe: "You tended to log higher mood on days you exercised."
- **Does not** interpret patterns clinically; only observes and nudges.

***

## EPIC-14: Health & Wellness AI Assistant (Full Stack)

**Goal:** AI that feels like a PT + nutritionist + PCP + meditation teacher + supportive friend — grounded in guidelines, never clinical.

### EPIC-14-E-01 — System Prompt (Physical + Mental)

```text
You are a wellness companion for {{name}}.

Physical health context: {{physical_summary}}
Mental health context: {{mental_summary}} (recent mood average, screener summary, goals)
Active goals: {{goals}}
Guideline ranges in use: {{guideline_summary}}

RULES (enforce on EVERY response):
- You are NOT a doctor, therapist, or licensed clinician.
- Never diagnose or prescribe.
- Always cite guidelines or sources for numeric targets.
- End every plan or recommendation with a caveat: "These suggestions are not medical advice. Please review with your doctor or licensed mental health professional before making changes."
- If the user expresses suicidal ideation, self-harm, or crisis, IMMEDIATELY output the crisis resources and STOP all other content.
- Mental health tool suggestions are supportive only and not a substitute for professional treatment.
```

### EPIC-14-E-02 — MCP Tools (Extended with Mental Health)

Physical (from v1):
- `get_guideline_ranges(profileId)`.
- `estimate_intake(profileId)`.
- `summarize_progress(profileId)`.
- `suggest_small_change(profileId)`.

Mental health additions:
- `get_mood_trend(profileId, days)` — returns mood/energy/anxiety/sleep averages over period.
- `suggest_cbt_exercise(profileId)` — returns most relevant CBT exercise based on recent mood patterns.
- `suggest_meditation_session(profileId)` — returns a session type from Medito appropriate to goal.
- `check_screener_thresholds(profileId)` — evaluates latest screener scores and generates referral text if thresholds met.[^6][^7]
- `generate_holistic_program(profileId)` — full combined program generation.

### EPIC-14-V-01 — Validate Assistant

- All responses include caveats.
- No diagnosis language appears.
- Crisis signal → crisis wall triggers.
- "Summarize my week" → returns physical + mental summary citing guideline sources.

***

## EPIC-15: Automation & Orchestration

**Goal:** n8n workflows for reminders, syncing, and daily/weekly flows.

Key flows:

- Daily mood check-in reminder if no MoodEntry logged after 6 PM.
- Weekly screener reminder every 7–14 days.
- If 5+ consecutive low mood entries → gentle prompt: "You've been logging lower mood lately. Would you like to try a short breathing exercise or reach out to someone you trust?"
- Nightly sync of tracker data from wger, Endurain, MoodMo, Perfice.[^32][^27][^31][^33][^24]

***

## EPIC-16: CLI (health-cli)

**Goal:** Terminal-based log and plan management.

Added mental health commands:

```bash
health-cli mood:log --mood 7 --energy 6 --anxiety 3 --sleep 7.5
health-cli screener:phq9
health-cli screener:gad7
health-cli meditate:log --minutes 15 --kind guided
health-cli cbt:log --exercise thought_record
health-cli coach:morning
health-cli plan:holistic --profile default
```

***

## EPIC-17: Containerization & Co‑Process Layout

**Goal:** Docker image with all physical and mental health co-processes behind nginx/supervisord.

Processes:

- Next.js app + MCP SSE server.
- USDA FoodData Central API mirror or fdc-api.[^21][^23][^19]
- wger / SparkyFitness / Endurain.[^27][^25][^26][^24]
- FHIR server (HAPI FHIR / Microsoft FHIR Server).[^28][^29][^30]
- MoodMo (mood tracking + journaling co-process).[^31][^32]
- Perfice (self-tracking co-process).[^33]
- Medito API (external SaaS / via API key, no self-hosted needed).[^36][^37][^35]
- n8n for automation.

Env flags control activation: `ENABLE_FHIR`, `ENABLE_WGER`, `ENABLE_MOODMO`, `ENABLE_PERFICE`, `ENABLE_USDA_MIRROR`.

Validation: all enabled co-processes pass health checks; crisis wall triggers correctly; screener threshold logic is enforced.

---

## References

1. [Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/399744584/abd6ec54-7f74-4389-aec4-b0a0b60ab632/Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md?AWSAccessKeyId=ASIA2F3EMEYEUPWYJT44&Signature=rXd%2BT%2BNKI9LmnaQwG8n5jx4F47M%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEMv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIQDdSTYyWDGZVF3VjoMYJ4n6emt%2BXA82t9e%2BTRxwmpZGfQIgNmAcrOKRLsNCMSQw1VRs1kDVAeAzWMRL%2Bgl7TUW90B4q%2FAQIlP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDP%2FkoP9T%2BNC2SIMu3CrQBIzcIQFEXZF3Z4kWnbcfezpe4uQn5OQcolQFPMG5HpM0%2BjEn5nHVKHfm%2BdsrSVzG5GfOG8DIbCFZW7LkjcGeYom8wRxa3d7ykmsshXQNdhO5IDFd2W00RYVSfgScprkCEwDQivRfhEZheqoGv6jAEGEqVx%2Fgu3CvV5cR7A1A56ypw0aY7qY8K61wpzQmXbkaPflWrhy2Wuaa5U%2F7ZcjFjc77Tg%2B5RAP5%2Fxs2jcgc9srsiYMI%2B01gBZIXaOH70xc7RW%2B5GZ8fQdbORRUwCPbs3E%2F6O1oZ%2BIVw9GcmbkQ1Kzf5%2BOYEoUifuTLFy1eYuLm6WbJ5xVc9dYyJfYlg8pCRYJOOkQFA3c4DGpiDxU1Rcs5bfT5JioKopjgW1%2BOhgrFKZPaOqUG%2B64Z5C1781I08%2BXsMDB6mF40IW6Q6%2FmzFW%2BYTZhvesgAvnXYr6nQrHkFKTHwPbsU%2BSqB%2BOQFZUfbeRzysYs51TEzO5ujkHV1FsmjaJIs27Fgqx1MALwI9Xxj32hjJ3Hii%2FVSdAzF5ei7xoEWeB%2F1hBFaVyWoSkmvlbYKajrGcR%2BBsPKTsdaPNj185rmcjRSrY3vDCYvBtO8d5M5BCgHi22Boyroc7cJ%2Ba2KmYusevNtaA%2B%2B9p%2FSUqAe6UN%2B5AX8efcDGQEGpsrbEhSoVOniZ0zG9DW6AXy8Yg2dlALfm5qHc2pjilcK5o%2FzvFZDXOctJNuA0uSjk%2FSZLzC%2FuO9S3UX5HWJPJ2IXiYp9s3NdpuDJ3D4mkJhOHGYNQvn7iFDIN4r5RtAFVLFzHNTJIwus%2FqzwY6mAEyRYDTExzW9to%2Fxm8HxdjxIyz6elTMFoZ%2FCW1Sz%2F6dD0JZ1zOA5nvvexsESvNk8JbnpYZDzxLyMv%2B3%2FN%2B2Th6YqyloDVYKWknw1YVJjIXVxyI%2BZwHeEVCZFMqa61EwU89JVova0D9PNHsJ57AaHWy4Pm47ZqoxYDwHe4EldyeRV9sjT1vwVGKwLbrAYtTowrXhGdm7%2BfsNfA%3D%3D&Expires=1778038157) - Every ticket follows EPIC-XX-APEV-NN where A Assess, P Plan, E Execute, V Validate. Epics are indepe...

2. [Online self-help CBT techniques - Every Mind Matters](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/) - You may have heard of CBT (cognitive behavioural therapy), wondered how it works, what it's good for...

3. [A guide for self-help guides: best practice implementation - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11286208/) - Guided self-help is an evidence-based intervention used globally. Self-help is a fundamental part of...

4. [A Provider's Guide to Brief Cognitive Behavioral Therapy](https://www.mirecc.va.gov/visn16/docs/therapists_guide_to_brief_cbtmanual.pdf) - CBT combines cognitive and behavioral therapies and has strong empirical support for treating mood, ...

5. [A guide for self-help guides: best practice implementation](https://www.tandfonline.com/doi/full/10.1080/16506073.2024.2369637) - Guided self-help interventions have been shown to be effective for a range of mental health difficul...

6. [Patient Health Questionnaire-9 (PHQ-9)](https://www.hiv.uw.edu/page/mental-health-screening/phq-9) - The PHQ-9 is a multipurpose instrument for screening, diagnosing, monitoring and measuring the sever...

7. [The Patient Health Questionnaire Anxiety and Depression ...](https://pmc.ncbi.nlm.nih.gov/articles/PMC4927366/) - The PHQ-ADS is the sum of the PHQ-9 and GAD-7 scores and thus can range from 0 to 48, with higher sc...

8. [Physical Activity Guidelines for Americans | odphp.health.gov](https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines) - The Physical Activity Guidelines for Americans is a flagship resource for health professionals and p...

9. [American Heart Association Recommendations for ...](https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults) - Get at least 150 minutes per week of moderate-intensity aerobic activity or 75 minutes per week of v...

10. [Guidelines and Recommended Strategies | Physical Activity](https://www.cdc.gov/physical-activity/php/guidelines-recommendations/index.html) - The report describes the amounts and types of physical activity needed to maintain or improve overal...

11. [New Physical Activity Guidelines for Americans](https://nutritionsource.hsph.harvard.edu/2018/11/13/new-physical-activity-guidelines-for-americans/) - For increased health benefits, adults should engage in at least 150 to 300 minutes a week of moderat...

12. [Dietary Guidelines for Americans](https://www.fns.usda.gov/cnpp/dietary-guidelines-americans) - The Dietary Guidelines for Americans, 2025-2030 is the current edition. For the first time in 25 yea...

13. [ACSM's General Exercise Guidelines](https://www.etsu.edu/exercise-is-medicine/guidelines.php) - The recommendation for healthy adults is: Perform moderate-intensity aerobic activity for a minimum ...

14. [The 2018 Physical Activity Guidelines for Americans](https://www.jospt.org/doi/10.2519/jospt.2019.0609) - Adults should engage in 150 to 300 minutes of moderate-intensity physical activity, or 75 to 150 min...

15. [2025-2030 Dietary Guidelines for Americans Released](https://www.cacfp.org/2026/01/08/2025-2030-dietary-guidelines-for-americans-released/) - The 2025-2030 DGAs recommend prioritizing high-quality protein, healthy fats, fruits, vegetables and...

16. [American College of Sports Medicine position stand. ...](https://pubmed.ncbi.nlm.nih.gov/21694556/) - The purpose of this Position Stand is to provide guidance to professionals who counsel and prescribe...

17. [Physical Activity Guidelines for Americans, 2nd edition](https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf) - Yet nearly. 80 percent of adults are not meeting the key guidelines for both aerobic and muscle-stre...

18. [Dietary Guidelines for Americans, 2025–2030](https://cdn.realfood.gov/DGA.pdf) - These Guidelines mark the most significant reset of federal nutrition policy in our nation's history...

19. [FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide) - The USDA FoodData Central API provides assistance to application developers wishing to incorporate n...

20. [USDA FoodData Central](https://fdc.nal.usda.gov) - USDA FoodData Central produces thorough resources for navigating and understanding nutritional info ...

21. [USDA FoodData Central — Nutrient Data for 300K+ Foods](https://www.formulabot.com/datasets/usda-food-nutrition-data) - Each food record includes macronutrients, micronutrients, serving sizes, and data source information...

22. [Downloadable Data | USDA FoodData Central](https://fdc.nal.usda.gov/download-datasets) - Data contained in FoodData Central can be downloaded. The download files are available both as an Ex...

23. [littlebunch/fdc-api: REST API and utilities for USDA Food ...](https://github.com/littlebunch/fdc-api) - Provides a REST server to query and retrieve USDA FoodData Central datasets. You can browse foods fr...

24. [Best Open Source Fitness Trackers 2026](https://sourceforge.net/directory/fitness-trackers/) - Self hosted FLOSS fitness/workout, nutrition and weight tracker. wger Workout Manager is a free and ...

25. [SparkyFitness: Built for Families. Powered by AI. Track food ...](https://github.com/CodeWithCJ/SparkyFitness) - A self-hosted, privacy-first alternative to MyFitnessPal. Track nutrition, exercise, body metrics, a...

26. [These 5 open source fitness apps are perfect for Android ...](https://www.androidpolice.com/best-open-source-fitness-apps-android/) - These open source and free Android apps let you track your health and fitness without sacrificing pr...

27. [Endurain: The Self-Hosted Fitness Tracker That Puts Your ...](https://www.blog.brightcoding.dev/2025/08/22/endurain-the-self-hosted-fitness-tracker-that-puts-your-data-back-in-your-hands) - Endurain is an open-source, self-hosted alternative to Strava, Garmin Connect and TrainingPeaks. Key...

28. [A Secure Architecture for Interoperable Personal Health ...](https://jpmsonline.com/article/a-secure-architecture-for-interoperable-personal-health-records-phr-based-on-blockchain-and-fhir-619/) - This work focuses on designing HL7 compliant PHR with security and privacy using blockchain, which i...

29. [Top Open Source FHIR Tools and Libraries in 2025](https://www.clindcast.com/top-open-source-fhir-tools-and-libraries-in-2025/) - In this article, we explore the top open-source FHIR tools and libraries in 2025, categorized for be...

30. [Hit Refresh. PHR to PFR (Personal FHIR® Record) with ...](https://darena.health/blog/hit-refresh-from-phr-to-pfr-personal-fhir-record-with-microsoft-fhir-server) - When the user clicks on the “Create Your Personal FHIR Account”, the app provisions a full working F...

31. [MoodMo is an Open-Source, Self-Hosted mood tracking ...](https://github.com/dnlzrgz/moodmo) - MoodMo is a self-hosted mood tracking and journal application built with privacy in mind, while also...

32. [13 Open-source Free Mood Tracker Apps](https://medevel.com/mood-tracker-139/) - MoodTracker is a free and open source web app that aims to help you understand yourself better. Trac...

33. [I built an open-source self-tracking app to find insights ...](https://www.reddit.com/r/selfhosted/comments/1n5sjp3/i_built_an_opensource_selftracking_app_to_find/) - Track anything you can imagine, whether it's mood, food or even times pooped. Custom forms can be cr...

34. [Which meditation apps are 100% free, nonprofit and open ...](https://meditofoundation.org/blog/meditation-apps-free-nonprofit-open-source) - Download Medito, the only 100% free, nonprofit and open source meditation app. meditation app mindfu...

35. [The Medito app is a 100% free meditation ...](https://github.com/meditohq/medito-app) - The Medito app is a 100% free meditation app built with flutter. The app is available on Android and...

36. [Medito Foundation](https://github.com/meditohq) - The Medito app is a 100% free meditation app built with flutter. The app is available on Android and...

37. [Free Meditation App — Medito Foundation](https://meditofoundation.org/medito-app) - The Medito App. Free-forever meditation. Made for people, not profit. Hundreds of guided meditations...

38. [Medito App download](https://sourceforge.net/projects/medito-app.mirror/) - The Medito app is a 100% free meditation app built with flutter. This is an exact mirror of the Medi...

39. [Mental Health Toolkit: Screening Tools](https://guides.library.kumc.edu/mentalhealthtoolkit/screening) - This website allows selection of several different screening tools in multiple languages. For Depres...

