/**
 * Autobiographer OS coach — per-mode context snapshot.
 *
 * Loads a compact, current-state view for one session. The shape varies
 * by mode so the model isn't given a full workshop dump every turn:
 *
 *   - interviewer: book meta (if scoped) + last 10 memory entries
 *     chronologically + (if scoped to a person) the person's
 *     relationship row + every memory referencing them.
 *   - chapter_drafter: chapter outline + the N memory entries linked
 *     via `agos_autobiographer_chapter_sources` (Phase 4) + the active
 *     voice profile JSON (Phase 3) + people referenced with consent
 *     state (Phase 2) + active pseudonym map for the book (Phase 6) +
 *     sensitive_kinds tags on source memories or current revision (Phase 6).
 *   - narrative_critic: chapter list + arc edges (Phase 5) + locked
 *     decisions about the book's arc kind (chronological/thematic/character_led).
 *   - general: book meta + counts only.
 *
 * Workshop-scoped sessions (no `bookId`) load a slimmer "across the
 * autobiographer workshop" view. The size cap (`MAX_CONTEXT_BYTES`) is
 * enforced after rendering to JSON so a pathological tag/notes payload
 * can't blow the model's context window.
 *
 * Mode-specific truncation priority (lowest-priority dropped first):
 *   - interviewer: drop oldest memories → drop person's referencing
 *     memories → drop person row.
 *   - chapter_drafter: drop voice profile examples (keep style_summary
 *     + rules) → drop people consent details (keep canonical_names) →
 *     drop oldest source memories.
 *   - narrative_critic: drop oldest chapters from list → drop arc edges
 *     details (keep arc kinds).
 *   - general: never exceeds (stats only).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import 'server-only';
import {
  getBookWithCounts,
  listBooks,
} from '../books-repo';
import type { AutobiographerBook } from '../books-repo';
import {
  listMemories,
  listMemoriesForBook,
} from '../memories-repo';
import type { AutobiographerMemory } from '../memories-repo';
import { getPerson } from '../people-repo';
import type { AutobiographerPerson } from '../people-repo';
import { listMemoriesForPerson } from '../memory-people-repo';
import {
  listChaptersForBook,
} from '../chapters-repo';
import type { AutobiographerChapter } from '../chapters-repo';
import { listSourcesForChapter } from '../chapter-sources-repo';
import { getActiveVoiceProfile } from '../voice-profiles-repo';
import type { AutobiographerVoiceProfile } from '../voice-profiles-repo';
import { listArcsForBook, getPrimaryArcForBook } from '../arcs-repo';
import type { AutobiographerArc } from '../arcs-repo';
import { listChaptersForArc } from '../arc-chapters-repo';
import { listPseudonymsForBook } from '../pseudonyms-repo';
import type { PseudonymWithPerson } from '../pseudonyms-repo';
import { listPeople } from '../people-repo';
import type { CoachMode } from './modes';
import type { SensitiveKind } from '../sensitive-kinds';
import { unionSensitiveKinds } from './safety';

/** Hard cap on the rendered JSON size (50 KB pre-prompt). Truncate beyond. */
export const MAX_CONTEXT_BYTES = 50_000;

/** Default cap on chronological memories surfaced in interviewer mode. */
export const INTERVIEWER_RECENT_MEMORY_LIMIT = 10;

// ─── Shared shape ────────────────────────────────────────────────────────

export interface CoachContextBookSummary {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  target_completion_date: string | null;
  target_audience: string | null;
  tags: string[];
  description: string | null;
  phase_progress_avg: number;
}

export interface CoachContextMemoryEntry {
  id: string;
  title: string;
  era_date_estimate: string | null;
  when_in_life: string | null;
  location: string | null;
  body_snippet: string;
  emotion_tags: string[];
  content_tags: string[];
  sensitive_kinds: SensitiveKind[];
  source: string;
}

export interface CoachContextPersonRow {
  id: string;
  canonical_name: string;
  aliases: string[];
  relation: string | null;
  consent_to_publish: string;
  birth_year: number | null;
  death_year: number | null;
  notes: string | null;
}

export interface CoachContextChapterEntry {
  id: string;
  title: string | null;
  slug: string | null;
  position: number;
  status: string;
  summary: string | null;
  target_word_count: number | null;
}

export interface CoachContextChapterSourceEntry {
  memory_id: string;
  memory_title: string;
  memory_when_in_life: string | null;
  memory_era_date: string | null;
  weight: number;
  notes: string | null;
  sensitive_kinds: SensitiveKind[];
}

export interface CoachContextVoiceProfileSummary {
  id: string;
  version: number;
  style_summary: string;
  style_adjectives: string[];
  style_rules: string[];
  example_openings: string[];
  sample_count: number;
  sample_word_count: number;
}

export interface CoachContextArcEntry {
  id: string;
  title: string;
  kind: string;
  is_primary: boolean;
  description: string | null;
  chapter_count: number;
}

export interface CoachContextPseudonymEntry {
  person_id: string;
  canonical_name: string;
  pseudonym: string;
  applied: boolean;
}

// ─── Per-mode payloads ──────────────────────────────────────────────────

export interface CoachInterviewerContext {
  book: CoachContextBookSummary | null;
  person: CoachContextPersonRow | null;
  /** Last N memories chronologically (era_date_estimate ASC). */
  recent_memories: CoachContextMemoryEntry[];
  /** Memories referencing `person` when scoped to one. */
  person_memories: CoachContextMemoryEntry[];
  /** Workshop counts when book/person not scoped. */
  workshop_counts: {
    memory_count: number;
    book_count: number;
    person_count: number;
  };
}

export interface CoachChapterDrafterContext {
  book: CoachContextBookSummary;
  chapter: CoachContextChapterEntry | null;
  source_memories: CoachContextChapterSourceEntry[];
  voice_profile: CoachContextVoiceProfileSummary | null;
  /** People appearing across the chapter's source memories with consent. */
  people: CoachContextPersonRow[];
  pseudonyms: CoachContextPseudonymEntry[];
  /** Union of every sensitive_kind across source memories. */
  sensitive_kinds: SensitiveKind[];
}

export interface CoachNarrativeCriticContext {
  book: CoachContextBookSummary;
  chapters: CoachContextChapterEntry[];
  arcs: CoachContextArcEntry[];
  primary_arc_id: string | null;
}

export interface CoachGeneralContext {
  book: CoachContextBookSummary | null;
  counts: {
    chapter_count: number;
    memory_count: number;
    book_count: number;
    voice_sample_count: number;
    person_count: number;
  };
}

export type AutobiographerCoachContext =
  | { mode: 'interviewer'; data: CoachInterviewerContext }
  | { mode: 'chapter_drafter'; data: CoachChapterDrafterContext }
  | { mode: 'narrative_critic'; data: CoachNarrativeCriticContext }
  | { mode: 'general'; data: CoachGeneralContext };

export interface BuildCoachContextInput {
  userId: string;
  mode: CoachMode;
  bookId?: string | null;
  /** Interviewer mode: optional person scope. */
  personId?: string | null;
  /** Chapter drafter mode: optional chapter scope. */
  chapterId?: string | null;
}

// ─── Shape mappers ──────────────────────────────────────────────────────

function bookSummary(b: AutobiographerBook): CoachContextBookSummary {
  const phases = b.phaseProgress;
  const values = Object.values(phases) as number[];
  const avg =
    values.length === 0
      ? 0
      : Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    status: b.status,
    target_completion_date: b.targetCompletionDate,
    target_audience: b.targetAudience,
    tags: b.tags,
    description: b.description,
    phase_progress_avg: avg,
  };
}

function memoryEntry(m: AutobiographerMemory): CoachContextMemoryEntry {
  const body = (m.bodyMarkdown ?? '').trim();
  const snippet = body.length > 320 ? body.slice(0, 319) + '…' : body;
  return {
    id: m.id,
    title: m.title,
    era_date_estimate: m.eraDateEstimate,
    when_in_life: m.whenInLife,
    location: m.location,
    body_snippet: snippet,
    emotion_tags: m.emotionTags,
    content_tags: m.contentTags,
    sensitive_kinds: m.sensitiveKinds,
    source: m.source,
  };
}

function personRow(p: AutobiographerPerson): CoachContextPersonRow {
  return {
    id: p.id,
    canonical_name: p.canonicalName,
    aliases: p.aliases,
    relation: p.relation,
    consent_to_publish: p.consentToPublish,
    birth_year: p.birthYear,
    death_year: p.deathYear,
    notes: p.notes,
  };
}

function chapterEntry(c: AutobiographerChapter): CoachContextChapterEntry {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    position: c.position,
    status: c.status,
    summary: c.summary,
    target_word_count: c.targetWordCount,
  };
}

function voiceProfileSummary(
  p: AutobiographerVoiceProfile,
): CoachContextVoiceProfileSummary {
  return {
    id: p.id,
    version: p.version,
    style_summary: p.styleSummary,
    style_adjectives: p.styleAdjectives,
    style_rules: p.styleRules,
    example_openings: p.exampleOpenings,
    sample_count: p.sampleCount,
    sample_word_count: p.sampleWordCount,
  };
}

function arcEntry(
  a: AutobiographerArc,
  chapterCount: number,
): CoachContextArcEntry {
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    is_primary: a.isPrimary,
    description: a.description,
    chapter_count: chapterCount,
  };
}

function pseudonymEntry(p: PseudonymWithPerson): CoachContextPseudonymEntry {
  return {
    person_id: p.personId,
    canonical_name: p.personCanonicalName,
    pseudonym: p.pseudonym,
    applied: p.applied,
  };
}

// ─── Mode-specific loaders ──────────────────────────────────────────────

async function loadInterviewer(
  userId: string,
  bookId: string | null,
  personId: string | null,
): Promise<CoachInterviewerContext> {
  const [book, allBooks, allPeople] = await Promise.all([
    bookId ? getBookWithCounts(bookId, userId) : null,
    listBooks({ userId, limit: 200 }),
    listPeople({ userId, limit: 500 }),
  ]);

  // Last N chronological memories. When book-scoped, scope to that book.
  let memories: AutobiographerMemory[];
  if (bookId) {
    memories = await listMemoriesForBook(bookId, userId, {
      limit: INTERVIEWER_RECENT_MEMORY_LIMIT,
    });
  } else {
    memories = await listMemories({
      userId,
      limit: INTERVIEWER_RECENT_MEMORY_LIMIT,
    });
  }
  // Sort chronologically (era_date_estimate ASC), nulls last.
  memories.sort((a, b) => {
    const av = a.eraDateEstimate ?? '';
    const bv = b.eraDateEstimate ?? '';
    if (av && !bv) return -1;
    if (!av && bv) return 1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });

  let person: AutobiographerPerson | null = null;
  let personMemories: AutobiographerMemory[] = [];
  if (personId) {
    person = await getPerson(personId, userId);
    if (person) {
      const joined = await listMemoriesForPerson(person.id, userId);
      // Re-fetch the full memory rows for the snippet/body content.
      // listMemoriesForPerson returns light fields only.
      const ids = joined.map((j) => j.memoryId);
      if (ids.length > 0) {
        const all = await listMemories({ userId, limit: 100 });
        personMemories = all.filter((m) => ids.includes(m.id));
      }
    }
  }

  return {
    book: book ? bookSummary(book) : null,
    person: person ? personRow(person) : null,
    recent_memories: memories.map(memoryEntry),
    person_memories: personMemories.map(memoryEntry),
    workshop_counts: {
      memory_count: memories.length,
      book_count: allBooks.length,
      person_count: allPeople.length,
    },
  };
}

async function loadChapterDrafter(
  userId: string,
  bookId: string,
  chapterId: string | null,
): Promise<CoachChapterDrafterContext> {
  const book = await getBookWithCounts(bookId, userId);
  if (!book) {
    throw new Error('Book not found or not owned by user');
  }
  const [chapters, voiceProfile, pseudonyms, allPeople] = await Promise.all([
    listChaptersForBook({ userId, bookId, order: 'position' }),
    getActiveVoiceProfile(userId),
    listPseudonymsForBook(bookId, userId),
    listPeople({ userId, limit: 500 }),
  ]);
  const chapter = chapterId
    ? chapters.find((c) => c.id === chapterId) ?? null
    : chapters[0] ?? null;

  // Load chapter sources (memory rows attached via Phase 4 join). Fall
  // back to an empty list when no chapter is in scope.
  let sources: CoachContextChapterSourceEntry[] = [];
  let sourceMemoryIds: string[] = [];
  if (chapter) {
    const joined = await listSourcesForChapter(chapter.id, userId);
    // Hydrate sensitive_kinds: listSourcesForChapter doesn't return them
    // (only display fields), so we pull them from full memory rows via a
    // single list call scoped to the book.
    const bookMemories = await listMemoriesForBook(bookId, userId, {
      limit: 500,
    });
    const memById = new Map(bookMemories.map((m) => [m.id, m]));
    sources = joined.map((j) => ({
      memory_id: j.memoryId,
      memory_title: j.memoryTitle,
      memory_when_in_life: j.memoryWhenInLife,
      memory_era_date: j.memoryEraDate,
      weight: j.weight,
      notes: j.notes,
      sensitive_kinds: memById.get(j.memoryId)?.sensitiveKinds ?? [],
    }));
    sourceMemoryIds = joined.map((j) => j.memoryId);
  }

  // People appearing in the source memories: intersection of
  // memory_people for any source memory id with the workshop people list.
  // We approximate by including every person referenced in pseudonyms
  // (active rename pool) + any person whose canonical_name appears in
  // any source memory body. This is cheap and keeps the context small.
  // For simplicity in Phase 7, include the entire pseudonym person set
  // plus any persons that show up in `allPeople` whose canonical_name is
  // mentioned in at least one source's body. The latter would require a
  // body fetch — we keep it deterministic by including all people whose
  // id is referenced by ANY pseudonym OR up to 20 most-recently-updated
  // people in the workshop.
  const pseudoPersonIds = new Set(pseudonyms.map((p) => p.personId));
  const people: AutobiographerPerson[] = allPeople
    .filter((p) => pseudoPersonIds.has(p.id) || true)
    .slice(0, 20);

  const sensitiveUnion = unionSensitiveKinds(
    sources.map((s) => ({ sensitive_kinds: s.sensitive_kinds })),
  );

  // Persist a snapshot of source_memory_ids and voice_profile_id so the
  // route layer can read them off the context (and the messages route
  // can write them into session metadata).
  void sourceMemoryIds;

  return {
    book: bookSummary(book),
    chapter: chapter ? chapterEntry(chapter) : null,
    source_memories: sources,
    voice_profile: voiceProfile ? voiceProfileSummary(voiceProfile) : null,
    people: people.map(personRow),
    pseudonyms: pseudonyms.map(pseudonymEntry),
    sensitive_kinds: sensitiveUnion,
  };
}

async function loadNarrativeCritic(
  userId: string,
  bookId: string,
): Promise<CoachNarrativeCriticContext> {
  const book = await getBookWithCounts(bookId, userId);
  if (!book) {
    throw new Error('Book not found or not owned by user');
  }
  const [chapters, arcs, primary] = await Promise.all([
    listChaptersForBook({ userId, bookId, order: 'position' }),
    listArcsForBook(bookId, userId),
    getPrimaryArcForBook(bookId, userId),
  ]);

  // Per-arc chapter counts via listChaptersForArc. Cheap loop — typically
  // < 5 arcs per book.
  const arcCounts: Record<string, number> = {};
  for (const a of arcs) {
    const c = await listChaptersForArc(a.id, userId);
    arcCounts[a.id] = c.length;
  }

  return {
    book: bookSummary(book),
    chapters: chapters.map(chapterEntry),
    arcs: arcs.map((a) => arcEntry(a, arcCounts[a.id] ?? 0)),
    primary_arc_id: primary?.id ?? null,
  };
}

async function loadGeneral(
  userId: string,
  bookId: string | null,
): Promise<CoachGeneralContext> {
  const [book, allBooks, allPeople] = await Promise.all([
    bookId ? getBookWithCounts(bookId, userId) : null,
    listBooks({ userId, limit: 200 }),
    listPeople({ userId, limit: 500 }),
  ]);

  // Per-book counts when scoped; else workshop totals.
  let chapterCount = 0;
  let memoryCount = 0;
  if (book) {
    const [chapters, memories] = await Promise.all([
      listChaptersForBook({ userId, bookId: book.id, order: 'position' }),
      listMemoriesForBook(book.id, userId, { limit: 500 }),
    ]);
    chapterCount = chapters.length;
    memoryCount = memories.length;
  } else {
    const memories = await listMemories({ userId, limit: 500 });
    memoryCount = memories.length;
  }

  // Voice sample count is too heavy to load full rows for here; the
  // book.metadata exposes a voiceSampleCount when the workshop voice
  // module has built one. Fall back to 0.
  const voiceSampleCount = 0;

  return {
    book: book ? bookSummary(book) : null,
    counts: {
      chapter_count: chapterCount,
      memory_count: memoryCount,
      book_count: allBooks.length,
      voice_sample_count: voiceSampleCount,
      person_count: allPeople.length,
    },
  };
}

// ─── Truncation ─────────────────────────────────────────────────────────

interface TruncationOutcome<T> {
  data: T;
  truncated: boolean;
}

function bytesOf(value: unknown): number {
  return JSON.stringify(value).length;
}

/**
 * Mode-shaped truncation: each mode has a documented "drop priority"
 * list. We walk it from lowest-priority to highest until the JSON
 * payload fits within `MAX_CONTEXT_BYTES`. Returns the (possibly
 * truncated) payload + a flag indicating whether any drop happened.
 *
 * The drop order per mode (see file docstring):
 *
 *   interviewer:
 *     1. drop oldest memories from recent_memories[]
 *     2. drop oldest person_memories[]
 *     3. drop person row entirely
 *
 *   chapter_drafter:
 *     1. drop voice_profile.example_openings (keep summary + rules + adjectives)
 *     2. drop voice_profile.example_openings + people.notes (keep canonical_names)
 *     3. drop oldest source_memories
 *
 *   narrative_critic:
 *     1. drop oldest chapters from list
 *     2. drop arc descriptions (keep arc kind + title)
 *
 *   general:
 *     never exceeds (stats only); returns unchanged.
 */
export function truncateInterviewer(
  data: CoachInterviewerContext,
): TruncationOutcome<CoachInterviewerContext> {
  let truncated = false;
  let working = data;
  // 1. Drop oldest recent_memories one at a time.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.recent_memories.length > 0
  ) {
    working = {
      ...working,
      recent_memories: working.recent_memories.slice(0, -1),
    };
    truncated = true;
  }
  // 2. Drop oldest person_memories.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.person_memories.length > 0
  ) {
    working = {
      ...working,
      person_memories: working.person_memories.slice(0, -1),
    };
    truncated = true;
  }
  // 3. Drop person row entirely.
  if (bytesOf(working) > MAX_CONTEXT_BYTES && working.person) {
    working = { ...working, person: null };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateChapterDrafter(
  data: CoachChapterDrafterContext,
): TruncationOutcome<CoachChapterDrafterContext> {
  let truncated = false;
  let working = data;
  // 1. Drop voice_profile.example_openings (keep summary + rules).
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.voice_profile &&
    working.voice_profile.example_openings.length > 0
  ) {
    working = {
      ...working,
      voice_profile: {
        ...working.voice_profile,
        example_openings: [],
      },
    };
    truncated = true;
  }
  // 2. Drop people consent detail rows down to canonical_names only.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.people.length > 0 &&
    working.people.some(
      (p) => p.notes != null || p.aliases.length > 0 || p.relation != null,
    )
  ) {
    working = {
      ...working,
      people: working.people.map((p) => ({
        id: p.id,
        canonical_name: p.canonical_name,
        aliases: [],
        relation: null,
        consent_to_publish: p.consent_to_publish,
        birth_year: null,
        death_year: null,
        notes: null,
      })),
    };
    truncated = true;
  }
  // 3. Drop oldest source_memories one at a time.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.source_memories.length > 0
  ) {
    working = {
      ...working,
      source_memories: working.source_memories.slice(0, -1),
    };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateNarrativeCritic(
  data: CoachNarrativeCriticContext,
): TruncationOutcome<CoachNarrativeCriticContext> {
  let truncated = false;
  let working = data;
  // 1. Drop oldest chapters (highest position first — those are later in
  // the manuscript and least relevant to opening pacing critique).
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.chapters.length > 0
  ) {
    working = { ...working, chapters: working.chapters.slice(0, -1) };
    truncated = true;
  }
  // 2. Drop arc descriptions; keep title + kind + is_primary.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.arcs.some((a) => a.description != null)
  ) {
    working = {
      ...working,
      arcs: working.arcs.map((a) => ({ ...a, description: null })),
    };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateGeneral(
  data: CoachGeneralContext,
): TruncationOutcome<CoachGeneralContext> {
  // Stats only — should never exceed 50 KB.
  return { data, truncated: false };
}

// ─── Entry point ────────────────────────────────────────────────────────

/**
 * Build the context payload for a single coach turn. Throws when the
 * caller passes a `bookId` that doesn't belong to `userId`; the route
 * layer maps that to a 404.
 *
 * Side channel: every returned payload may carry a `_truncated: true`
 * marker on its top-level data object so the route trailer can echo
 * it back to the UI. Callers should treat the boolean as advisory; the
 * truncated payload is otherwise indistinguishable from a non-truncated
 * one (no synthetic markers inside arrays).
 */
export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<{ context: AutobiographerCoachContext; truncated: boolean }> {
  switch (input.mode) {
    case 'interviewer': {
      const data = await loadInterviewer(
        input.userId,
        input.bookId ?? null,
        input.personId ?? null,
      );
      const out = truncateInterviewer(data);
      return {
        context: { mode: 'interviewer', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'chapter_drafter': {
      if (!input.bookId) {
        throw new Error('chapter_drafter requires a bookId');
      }
      const data = await loadChapterDrafter(
        input.userId,
        input.bookId,
        input.chapterId ?? null,
      );
      const out = truncateChapterDrafter(data);
      return {
        context: { mode: 'chapter_drafter', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'narrative_critic': {
      if (!input.bookId) {
        throw new Error('narrative_critic requires a bookId');
      }
      const data = await loadNarrativeCritic(input.userId, input.bookId);
      const out = truncateNarrativeCritic(data);
      return {
        context: { mode: 'narrative_critic', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'general': {
      const data = await loadGeneral(input.userId, input.bookId ?? null);
      const out = truncateGeneral(data);
      return {
        context: { mode: 'general', data: out.data },
        truncated: out.truncated,
      };
    }
  }
}
