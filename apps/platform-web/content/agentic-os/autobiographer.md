# Autobiographer OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, mirroring the other OS plans.[^1]
Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete.
Execute tickets include concrete file paths, package names, and commands; Validate tickets include pass/fail criteria an automated agent can evaluate.

This updated version folds in a detailed **style-learning and ghostwriting flow** so you can plug in any LLM backend.

***

## Frozen Tech Stack (All Tickets Assume This)

Same base as the other OSes.[^1]

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

### Narrative Co‑Processes

| Function | Default Tool | License | Notes |
|---|---|---|---|
| Journal storage | Obsidian / Joplin | Proprietary + MIT / AGPL | Local Markdown vault or synced notebooks.[^2][^3][^4][^5] |
| Quick capture | `memos` / Journiv | MIT / AGPL | Self‑hosted micro‑notes & journaling.[^6][^7] |
| Speech‑to‑text | Whisper / whisper.cpp / faster‑whisper | MIT | Local/offline STT.[^8][^9][^10] |
| Voice dictation app | Handy / OpenWhispr | MIT | Desktop dictation with Whisper backend.[^8][^10] |
| Automation | n8n | Fair-code | Glue for reminders and imports.[^9] |

***

## EPIC-01: Project Scaffold & Monorepo

(Identical to other OSes: scaffold `~/autobiographer-os/` with `apps/web`, `packages/ui`, `packages/db`, `packages/mcp-server`, `packages/mcp-client`, `packages/integrations`, infra configs, and validate Turborepo builds.)[^1]

***

## EPIC-02: Database Schema (Prisma + SQLite)

**Goal:** Capture life structure (people, periods, events, themes), conversation logs, outline, drafts, and style/voice config.

Entities include Persona, LifePeriod, LifeEvent, Place, Theme, MemoryFragment, ConversationSession/ConversationTurn, OutlineNode, DraftSegment, StyleSample, StyleModel, VoiceProfile, JournalingSource, plus AI/MCP/Automation/ActivityLog as in other OSes.

(See previous plan for full Prisma schema; unchanged except that StyleModel now explicitly stores `styleSummary`, `styleRules`, and `styleAdjectives` fields.)

***

## EPIC-03: Auth & Persona Setup

**Goal:** Standard NextAuth login, plus first‑run wizard to create the autobiographer `Persona` and default `VoiceProfile`.

- Collect name, nickname, pronouns, rough birth year, and desired tone keywords (e.g., "wry", "earnest", "casual").
- Create initial OrgSettings (e.g. `voice_mode_enabled = true`).

***

## EPIC-04: Org Settings & Feature Flags

**Goal:** One central place to control conversational modes, journaling sources, style learning, and ghostwriter behavior.

Example flags in `OrgSetting`:

- `voice_mode_enabled`, `friend_mode_enabled`, `interviewer_mode_enabled`.
- `obsidian_enabled`, `joplin_enabled`, `memos_enabled`.
- `ghostwriter_enabled`, `style_learning_enabled`.

Settings UI toggles these and configures vault paths/WebDAV, STT backend, and mic device.

***

## EPIC-05: Conversational Capture (Voice & Text)

**Goal:** `/talk` experience where the user speaks or types, the assistant responds like a friend/interviewer, and transcripts are stored as ConversationTurns and MemoryFragments.

- STT bridge to Whisper/Handy/OpenWhispr.[^8][^9][^10]
- Push‑to‑talk by default; optional continuous mode with VAD.
- Background task clustering turns into MemoryFragments and mapping them to LifeEvents.

***

## EPIC-06: Journaling Import & Sync

**Goal:** Import existing notes from Obsidian/Joplin/memos into MemoryFragments and optionally StyleSamples.[^2][^6][^3][^4][^5]

- File system / WebDAV connectors.
- `/journal-import` UI for review, tagging by period/event/theme, and marking as style samples.

***

## EPIC-07: Timeline & Life Map

**Goal:** Visual timeline of LifePeriods and LifeEvents, with MemoryFragments and Themes attached.

- `/timeline` UI: vertical periods, event cards, theme tagging.

***

## EPIC-08: Outline & Book Structure

**Goal:** Manage book outline as a tree of OutlineNodes (book → parts → chapters → scenes) linked to periods/themes.

- `/outline` UI: drag‑and‑drop tree; link nodes to LifePeriods; show coverage of events.

***

## EPIC-09: Style Learning (Ghostwriter Core) — Prompts & Data Flow

**Goal:** Learn a reusable `StyleModel` from user writing samples and use it as a blueprint for later generation.

### EPIC-09-A-01 — Collect StyleSamples

**Type:** Assess / Execute

- Let user mark imported notes or new writing as **style samples** in `/style`.
- Each selected note becomes one or several `StyleSample` rows; for long notes, chunk into 500–1500 word segments.[^11]

**Acceptance:** User can see and manage a list of StyleSamples with source and description.

***

### EPIC-09-P-01 — Define StyleModel Fields

**Type:** Plan

Augment `StyleModel` Prisma model with fields:

- `styleSummary String` — 3–6 sentence natural‑language description.
- `styleRules String` — JSON string of do/don’t rules.
- `styleAdjectives String` — JSON array or comma‑separated adjectives.
- Optionally `exampleOpenings String?` — JSON list of example openings.

Document this in `STYLE_MODEL_SPEC.md`.

***

### EPIC-09-E-01 — Single-Sample Style Analysis Prompt

**Type:** Execute

Implement a backend job `analyzeStyleSample(sampleId)` that:

1. Chunks `StyleSample.text` if necessary.
2. Calls `callLLM()` with:

**SYSTEM**

> You are a forensic writing style analyst. You DO NOT rewrite or improve the text. Your job is to describe how it is written: tone, rhythm, vocabulary, sentence structure, perspective, and other stylistic patterns.

**USER**

```text
Analyze the WRITING STYLE ONLY of the following text.

TEXT START
{{sample_text}}
TEXT END

Return a strict JSON object with these fields:

{
  "overall_style_summary": "2–4 sentences summarizing the style",
  "tone": "comma-separated adjectives describing tone (e.g. wry, vulnerable, formal)",
  "sentence_structure": "how long are sentences, how complex, typical patterns",
  "vocabulary": "simple/complex, any recurring words/phrases, slang, jargon",
  "pacing": "fast/slow, how often pauses, how often digressions",
  "point_of_view": "first person / third person, distance to events",
  "imagery_and_metaphor": "how often, what kinds, concrete vs abstract",
  "dialogue_and_quote_usage": "frequency and style of dialogue or quoting",
  "typical_paragraph_structure": "short blocks, long reflections, lists, etc.",
  "other_notable_features": "anything distinctive not covered above",
  "style_adjectives": ["3–10 adjectives that capture the style, lowercase"]
}

Do not include any explanation outside the JSON.
```

3. Parses JSON and stores it in a temporary table or in memory for aggregation.[^12][^13][^14][^11]

**Pass:** For several different StyleSamples, LLM returns valid JSON with non‑empty fields.

***

### EPIC-09-E-02 — Multi-Sample Aggregation Prompt

**Type:** Execute

Implement `buildStyleModel(personaId)` job that:

1. Fetches all StyleSamples (and their per-sample analysis) for the persona.
2. Concatenates 3–10 per-sample JSON analyses into one prompt and calls `callLLM()` with:

**SYSTEM**

> You are combining multiple style analyses into a single coherent writing style blueprint for the same author.

**USER**

```text
You are given several JSON style analyses of the SAME author.

ANALYSES:
{{analysis_json_1}}
{{analysis_json_2}}
{{analysis_json_3}}
...

Combine them into ONE consolidated style profile for this author.

Return JSON:

{
  "style_summary": "3–6 sentences summarizing the author’s writing style.",
  "style_rules": [
    "Short bullet rules in imperative form, e.g. 'Use first-person singular and stay close to lived experience.'",
    "Each rule should be phrased as something the model should DO or AVOID when writing."
  ],
  "style_adjectives": ["comma", "separated", "adjectives"],
  "example_openings": [
    "One or two example opening sentences that feel typical for this style, but with neutral content."
  ]
}

No explanation outside the JSON.
```

3. Writes the result into `StyleModel` fields.

**Pass:** StyleModel created/updated with non‑empty `styleSummary`, `styleRules`, `styleAdjectives` after at least 3 StyleSamples.[^14][^15]

***

### EPIC-09-E-03 — LLM Backend Wrapper

**Type:** Execute

Create `lib/llm.ts` (or similar) with a single abstraction:

```ts
export async function callLLM({
  system,
  user,
  temperature = 0.7,
  maxTokens = 1200,
}: {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  // Wire to OpenAI, local Llama, vLLM, etc.
}
```

All style analysis and generation calls go through this function to decouple from provider.[^16][^17][^18]

***

### EPIC-09-V-01 — Validate Style Learning

- Mark at least 3 StyleSamples.
- Run `buildStyleModel(personaId)`.
- Confirm StyleModel row exists with `styleSummary`, `styleRules`, `styleAdjectives` populated and visible in `/style` UI.

***

## EPIC-10: Ghostwriting & Drafting Engine — Using StyleModel

**Goal:** Generate autobiographical drafts in the user’s voice using the StyleModel as a blueprint and life events as content.

### EPIC-10-P-01 — Content vs. Style Separation

**Type:** Plan

Document in `GHOSTWRITER_SPEC.md`:

- **Style** comes solely from StyleModel (`styleSummary`, `styleRules`, `styleAdjectives`).
- **Content** comes from LifeEvents, MemoryFragments, Places, and Themes.
- Prompts must keep these separate to avoid hallucinating facts while still imitating style.[^19][^11]

***

### EPIC-10-E-01 — Draft Generation API

**Type:** Execute

Create `api/drafts/generate` route:

Input JSON:

```json
{
  "outlineId": "...",
  "targetWords": 800,
  "focusEventIds": ["..."],
  "openingTone": "uncertain",
  "endingTone": "hopeful"
}
```

Handler steps:

1. Fetch OutlineNode, linked LifePeriod and Themes.
2. Fetch selected LifeEvents and MemoryFragments.
3. Fetch StyleModel.
4. Build SYSTEM message:

```text
You are an autobiographical ghostwriter for {{persona_name}}.

Write in the author's voice, following this style blueprint:

Style summary:
{{styleSummary}}

Style adjectives:
{{styleAdjectives_comma_separated}}

Style rules:
{{styleRules_bulleted}}

General constraints:
- Preserve factual content exactly as given.
- Do NOT invent facts.
- It is OK to change ordering and phrasing to improve narrative flow.
- Keep the style consistent with the blueprint above.
```

5. Build USER message:

```text
Write a {{targetWords}}-word autobiographical scene.

Content to cover (facts and feelings):

{{bullet_list_of_facts_from_events_and_fragments}}

Themes to emphasize:
{{comma_separated_theme_names}}

Perspective & tense:
- First person singular ("I").
- Past tense, reflecting back on these events.

Tone:
- Start with {{openingTone}}.
- Gently move toward {{endingTone}} if appropriate.

Important:
- Do not mention that you are an AI.
- Do not mention the existence of any style blueprint.
- Do not summarize; write as if this is part of the final book.
```

6. Call `callLLM({ system, user })`.
7. Store result as `DraftSegment` with `role = "ai"` and `version = 1`.

**Pass:** For a node with several memory fragments, endpoint returns a coherent narrative in correct POV and approximate length.

***

### EPIC-10-E-02 — Few-Shot Style Conditioning (Optional)

**Type:** Execute

Enhance USER message by prepending 1–2 short examples from `StyleSample` texts:

```text
EXAMPLES OF HOW THE AUTHOR WRITES (do not copy content, only style):

[Example 1]
{{short_paragraph_from_style_sample_1}}

[Example 2]
{{short_paragraph_from_style_sample_2}}

--- END OF EXAMPLES ---

Now write the new scene as instructed below.
```

This uses in‑context learning to further align style.[^17][^18][^14]

***

### EPIC-10-E-03 — "Rewrite in My Voice" API

**Type:** Execute

Create `api/drafts/rewriter` route to style‑align user drafts.

Input:

```json
{
  "draftText": "...",
  "personaId": "..."
}
```

SYSTEM:

```text
You are editing the following autobiographical draft to match the author's voice.

Use the style blueprint below, but keep all factual content and emotional meaning.

STYLE BLUEPRINT:
{{styleSummary}}
Style adjectives: {{styleAdjectives}}
Style rules:
{{styleRules}}
```

USER:

```text
ORIGINAL DRAFT:
{{user_draft}}

TASK:
Rewrite the text in the author’s style.
Do not add new events or facts.
You may reorder sentences or add connective tissue for flow.
Return only the rewritten text.
```

Store result as a new `DraftSegment` with `role = "ai"`, `version = existing_version + 1`, and keep original as reference.[^11][^19]

***

### EPIC-10-E-04 — Draft Editor UI

**Type:** Execute

`/write/[outlineId]` page:

- Shows OutlineNode context and list of DraftSegments.
- For each AI-generated draft: display text, version number, and quick actions ("Accept", "Edit", "Regenerate").
- User edits are stored as `DraftSegment role = "user"` for that outline node.

***

### EPIC-10-V-01 — Validate Ghostwriting Flow

- With a StyleModel trained from 3+ samples, generate a draft for one chapter.
- Confirm:
  - Writing uses first-person, past tense, and matches tone adjectives.
  - Facts match source events/fragments.
- Run "rewrite in my voice" on a neutral paragraph and confirm tone shifts toward the user’s known style.

***

## EPIC-11: Conversational Ghostwriter Mode

**Goal:** Turn a live conversation in `/talk` into narrative drafts on demand.

- After a block of ConversationTurns, assistant offers: "Turn this into a written scene?".
- If accepted, call `api/drafts/generate` with those turns as MemoryFragments.
- Tone toggles in UI modify `openingTone`/`endingTone` in prompt.

Validation: a 5–10 minute conversation yields at least one draft scene that aligns with content and StyleModel.

***

## EPIC-12: AI Assist for Structure & Themes

**Goal:** MCP tools to suggest opening scenes, themes, and structural gaps.

- Tools: `suggest_opening_scene`, `propose_themes`, `diagnose_gaps` using events/themes and outline coverage.

***

## EPIC-13: Automation (n8n)

**Goal:** Automate daily/weekly prompts and note imports.

- Daily reminder if no ConversationSession exists.
- On new Obsidian note with `#autobio`, import as MemoryFragment & optional StyleSample.[^5][^2]

***

## EPIC-14: MCP Client & CLI (autobio-cli)

**Goal:** Terminal commands to manage periods, events, style, and drafts:

- `autobio-cli style:add-sample path/to/file.md`
- `autobio-cli style:rebuild`
- `autobio-cli draft:generate --outline chapter_3`

***

## EPIC-15: Container & Co‑Process Layout

**Goal:** Dockerized stack with:

- Next.js app, MCP SSE server.
- STT backend (Whisper/Handy/OpenWhispr).[^9][^10][^8]
- Optional Obsidian/Joplin access (via bind mounts/WebDAV).[^4][^2][^5]
- n8n for automation.

Feature flags control which co‑processes start so a minimal install can just be text-only journaling and drafting, while a full install supports voice, external vaults, and rich automation.

---

## References

1. [Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/399744584/abd6ec54-7f74-4389-aec4-b0a0b60ab632/Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md?AWSAccessKeyId=ASIA2F3EMEYEYB73I6GR&Signature=06av6001MAlXGge5WcvN9zBYaGA%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEMb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIQCDeJVGA2gwc9TgVvm4TM9WSwDT2Zi2oTtVF3RduZMnQgIgfUgpCMu6wYgJt%2BhFe5VqBnCL0C%2FBi%2BTbAlTCyGRlFIIq%2FAQIj%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDNjo8De1QXP4Csh56irQBCXWsaoE6nYD7hXnBv%2BE6N3NN6WU5p0wygWhLxCPGIuHUTxony29lHuEhinBg3fFWQPdyzSsncPbful1dx2Lt5%2B6aGBTrcxwSRf1VPTzNog5BAmSLySPSQpfb0K7rE0zvco6NTXSFCgxHD7YpwEzuTBA5AoqVuHszF9zb4xIlF6tXdvfiaZcv%2FjbxI%2BH7werdiMmA7CZci5CWxRA%2B1SXjTmOosuiNVPm70yqoR5rfNs1hbJi5MxMVWMfuNaHen3WUIsGSp8BvzToA%2Bqlxb8OCdmqgegUphLIMX26G0bRFdgvb9ePTFSxKhsAdKwmM4o3kWAveGBYboLn6Gf6%2BeTNIG1hEGLW0o112Lkl7ijXR4G4bBPE1Scf5WoVpxUbxCFSkKXku3I4Sb24yeriN%2FFyeFboYuaYRwZntKDlIIAbS2TZn85TGriJ7L9QQKdNpdp9OI%2BlZ%2BACa8PwuLgjLvsIm9nJ%2FTSkyxAQhBMy7PACdfkoGpqgixTkgzdzVyokY2aF9Usbvj2mdnTo0hNufxTFHzbmgHxq2oawNgB1U5q3w%2BM8GhIvAGECOdFFRCX1%2F%2FA6LLNbkBwR%2BHgCCB0KTiKCTno45%2BoKT7Bepy9CaXEHP%2F2Et2HrETWy5YMdTf2rWRnBWcJde8gMD%2By11gkZQcnMTmPmDSb86x9EQWqq3K%2F1mGD15fqm2RGi8hks2KU3WzotNmoeOtO6d6A7fZFKtC4SGnbTE3w012ijAvqO2%2Bz4j0UyXXxTpz79PV1HG%2B1vrtnF5mb1VkdjhR%2B3BNAwmzgfsYUw2MzpzwY6mAFXI7VW1%2FESxoZN1gXvHymRd4fsjBRnOrnfAwh2Twf9Ww2ygBIfLu%2Fdg6lQ6Tm3TvUuW13LkCCrrOJUwmRNuMmK6Y1gKBUJaRHTKPrnvXTKY8uFRWPKYeJWqhLlRdM%2FmEuZmGRGdjES1uPm%2BVZH5VubdOOv6%2FLIHjoXv%2BAIFHnnBUcyKJZgDVTMqSFElwfvG%2BBrXLzotlt3LQ%3D%3D&Expires=1778021419) - Every ticket follows EPIC-XX-APEV-NN where A Assess, P Plan, E Execute, V Validate. Epics are indepe...

2. [Best Markdown Note Taking Apps in 2025 - NotePlan](https://noteplan.co/blog/best-markdown-note-taking-app) - Best markdown apps at a glance ; Joplin. Open-source; end-to-end encryption; cross-platform syncing;...

3. [Free and Open Source Note Management and Journaling Apps for ...](https://www.mactools.pro/blog/free-and-open-source-note-management-and-journaling-apps-for-mac) - Joplin is a versatile, open-source note-taking app that supports Markdown, a lightweight text format...

4. [Top 16 Best Note Taking Apps For Linux [2025] - It's FOSS](https://itsfoss.com/note-taking-apps-linux/) - QOwnNotes is yet another open-source note-taking app that supports Markdown. In addition to that, it...

5. [Obsidian vs Logseq: Choosing a Note-Taking App](https://blog.openreplay.com/obsidian-vs-logseq-note-taking-app/) - Both Obsidian and Logseq store your notes as plain text Markdown files. This means your data remains...

6. [usememos/memos: Open-source, self-hosted note-taking tool built ...](https://github.com/usememos/memos) - Open-source, self-hosted note-taking tool built for quick capture. Markdown-native, lightweight, and...

7. [Meet Journiv — A self-hosted private journaling & mood tracker (Day ...](https://www.reddit.com/r/opensource/comments/1oak21g/meet_journiv_a_selfhosted_private_journaling_mood/) - Hey folks! I got into self-hosting last year. While exploring, I noticed there's no real self-hosted...

8. [Handy - a simple, open-source offline speech-to-text app ...](https://www.reddit.com/r/LocalLLaMA/comments/1ldvosh/handy_a_simple_opensource_offline_speechtotext/) - A cross-platform speech-to-text app using whisper.cpp that runs completely offline. Press shortcut, ...

9. [Run Whisper Locally: Offline Speech-to-Text Guide](https://localaimaster.com/blog/whisper-local-speech-to-text) - Run OpenAI Whisper locally for private speech-to-text. Compare model sizes, install whisper.cpp and ...

10. [OpenWhispr | Open Source Voice to Text & Dictation App](https://openwhispr.com) - Local AI that stays local. Whisper and Parakeet run directly on your hardware. No audio is sent anyw...

11. [Implementing Long Text Style Transfer with LLMs through ...](https://arxiv.org/html/2505.07888v1) - This paper addresses the challenge in long-text style transfer using zero-shot learning of large lan...

12. [How To Make LLMs Write Stylishly](https://pub.towardsai.net/how-to-make-llms-write-stylishly-6691be12b970) - The very simple prompt to “rewrite the text in the style of Bertrand Russell” which will leverage th...

13. [without sounding like a robot. Here's how to prompt AI.](https://www.linkedin.com/pulse/text-style-transfer-actually-works-morten-rand-hendriksen-vnpkc) - Find a good sample of the target writing style (yours or someone else's) · Run it through the three-...

14. [Teach LLMs to mimic your style - Relevance AI Documentation](https://relevanceai.com/docs/example-use-cases/few-shot-prompting) - Few-shot prompting is a technique that feeds an LLM with some example data on how you want the respo...

15. [Using Prompts to Guide Large Language Models in Imitating a Real ...](https://arxiv.org/html/2410.03848v1) - This study compares the language style imitation ability of three different large language models un...

16. [The Complete Guide to Prompt Engineering in 2025](https://dev.to/fonyuygita/the-complete-guide-to-prompt-engineering-in-2025-master-the-art-of-ai-communication-4n30) - The Modern Era: 2024-2025. Prompt engineering techniques are methods that enhance the accuracy of LL...

17. [Zero-Shot, One-Shot, and Few-Shot Prompting](https://learnprompting.org/docs/basics/few_shot) - In this section, we dive into three key prompting techniques—zero-shot, one-shot, and few-shot promp...

18. [Few-Shot Prompting Techniques - ApX Machine Learning](https://apxml.com/courses/python-llm-workflows/chapter-8-prompt-engineering-python/few-shot-prompting-techniques) - Few-shot prompting is a fundamental technique in practical prompt engineering. By providing concrete...

19. [LLM-Based Text Style Transfer: Have We Taken a Step ...](https://ieeexplore.ieee.org/iel8/6287639/10820123/10915631.pdf) - Methods based on prompt routing use a routing mechanism to select the best prompt that is the most e...

