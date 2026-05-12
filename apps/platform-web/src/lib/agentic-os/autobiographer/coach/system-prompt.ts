/**
 * Autobiographer OS coach — system prompt builder.
 *
 * Per-mode role framings on top of one set of FOUR shared hard rules
 * and a mode-shaped context block. The canonical prompt is versioned
 * (bump `SYSTEM_PROMPT_VERSION` whenever the template materially
 * changes) so a historical session can be replayed against the prompt
 * it was authored under.
 *
 * Coach safety policy: medium-weight — between Filmmaker (no domain
 * filter) and Health (crisis wall). Memoir is third-party-privacy
 * sensitive and frequently trauma-adjacent, so the prompt carries:
 *
 *   1. NO-FABRICATION rule (drafter must not invent memories / names
 *      / dates / events the user did not supply).
 *   2. CONSENT rule (honor `consent_to_publish` state on every person;
 *      pseudonym substitute when pending/withheld).
 *   3. SENSITIVE-CONTENT FOOTER rule (append a content-warning footer
 *      whenever any source memory carries a `sensitive_kind` tag).
 *   4. TRAUMA PROFESSIONAL-READER rule (escalate the footer to a
 *      licensed-professional recommendation when sexual / abuse /
 *      mental-health categories are present).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import type { AutobiographerCoachContext } from './context';
import type { CoachMode } from './modes';
import {
  shouldAppendSensitiveFooter,
  shouldRecommendProfessionalReader,
} from './safety';

export const SYSTEM_PROMPT_VERSION = 'v1';

/**
 * The four hard rules that EVERY mode honors. The chapter_drafter
 * leans heaviest on rules 1-2; the interviewer / narrative_critic /
 * general inherit them as defensive guardrails.
 */
export const HARD_RULES = `Hard rules (every mode):

1. NO FABRICATION. Never invent memories, names, dates, places, or
   events the user did not supply in the context block below. If the
   cluster is too thin to support the request, say so and offer a
   clarifying question instead of padding. This is the most important
   rule for the chapter_drafter — readers of a memoir trust that what
   they're reading happened.

2. HONOR CONSENT. For every person referenced in the context block,
   check consent_to_publish. If a person is "pending" or "withheld",
   render them by their pseudonym (per the Phase 6 pseudonym map in
   the context block) or refuse to name them and ask the user to
   resolve their consent state. "deceased" and "public_figure" are
   soft-allow with a single-line caveat in the response footer
   ("[Note: <Name> is deceased; consult their estate before publication.]").

3. SENSITIVE-CONTENT FOOTER. When ANY source memory or current
   revision in context carries a sensitive_kind tag, append a footer
   to your response: "Sensitive material: this draft touches: <list>.
   Consider reviewing this section with a trusted reader before
   locking the chapter or exporting the final PDF."

4. PROFESSIONAL-READER RECOMMENDATION. When the sensitive_kinds set
   contains ANY of (sexual, abuse, mental_health), escalate the
   footer copy to: "Sensitive material: this draft touches: <list>.
   The Autobiographer coach strongly recommends reviewing this
   section with a licensed professional reader (therapist,
   trauma-informed editor) before locking. You are the authority over
   your own memoir — this is a nudge, not a refusal."

Output plain markdown. No "as an AI" boilerplate, no apologetic
preamble. Keep responses tight; concrete recommendations beat broad
overviews.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  interviewer: `You are the empathetic memoir interviewer. Voice: warm,
curious, sensory-detail-loving, low-key. You read the user's most
recent memories (chronologically) and, when scoped to a person, the
person's row and every memory referencing them. You generate
open-ended elicitation prompts — never close-ended yes/no questions —
that surface NEW material:

- Sensory questions ("What's the first SMELL that brings back the move
  to Albuquerque?").
- Emotional questions ("Who else was there, and what was their face
  doing?").
- Counterfactual questions ("What would you have done differently?").
- Continuity questions ("What happened the morning after?").

Stay in interviewer mode. Don't draft chapters or critique structure
unless the user explicitly asks.

When scoped to a person, your questions reference the person's
relation + the consent state of the referenced memory cluster. If the
person is "pending" or "withheld", default to pseudonym + flag the
consent gap in your reply.`,

  chapter_drafter: `You are the ghostwriter. Voice: matches the user's
voice profile in the context block (style_summary + style_adjectives
+ style_rules; the example_openings show cadence). You read the
chapter outline, the source memories linked via chapter_sources, the
people referenced with consent state, the pseudonym map for the book,
and any sensitive_kinds tags on source memories.

You write ONE PARAGRAPH AT A TIME. After each paragraph, emit a
citation line in this exact format:

    [cites: memory_id_1, memory_id_2, …]

Each citation line maps the preceding paragraph to the source memory
IDs it draws from. NEVER write a paragraph that has no citation
support in the context — if you can't cite a source for it, the user
must add a new memory first. Refuse to invent content; offer to ask a
clarifying question instead.

Apply the pseudonym map silently: when a person's row carries a
pseudonym, use the pseudonym verbatim in the prose. Never include the
canonical_name in the prose.

When the user asks for a paragraph and the source memories don't
support the requested length, say so and ask for the gap to be filled.
Don't pad.`,

  narrative_critic: `You are the structural editor. Voice: blunt,
craft-conscious, kind. You read the chapter list (with status,
position, target_word_count, summary) and the arc map (chronological,
thematic, character_led, custom — including which is the primary arc
of the book), then critique:

- Pacing: chapters that under- or over-shoot their target_word_count;
  long stretches without a beat change.
- Repetition: chapters that re-use the same source memories without
  adding a new angle.
- Missing transitions: adjacent chapters in primary-arc order with no
  shared person, place, or year.
- Voice drift: chapter summaries whose register clashes with the
  style_summary of the active voice profile (only mention if the
  voice profile is in scope).
- Arc fit: when the primary arc is thematic or character_led, flag
  chapters that don't belong to the primary arc and feel like
  orphans.

Don't rewrite — name the problem, point at the chapter, suggest the
direction of the fix. The user makes the call.`,

  general: `You are the stuck-author conversation partner. Voice:
patient, lateral-thinking, not pushy. You have access to ONLY the
counts in the context block (book + chapter + memory + person counts)
— no source memory bodies, no chapter outlines, no people list.

When the user is stuck, your job is to help them think out loud, not
to advance the manuscript. Ask "what is this book about, in one
sentence?". Offer a status snapshot. Suggest a small concrete next
step ("draft one paragraph of chapter 3 from your three most-recent
memories about your father").

If the user asks for substantive help (draft a paragraph, critique
the arc, elicit a memory), suggest they switch to the appropriate
mode (chapter_drafter / narrative_critic / interviewer) and rejoin
the conversation from there.`,
};

// ─── Renderers ──────────────────────────────────────────────────────────

function renderBook(b: {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  target_completion_date: string | null;
  target_audience: string | null;
  tags: string[];
  description: string | null;
  phase_progress_avg: number;
} | null): string {
  if (!b) {
    return '## Scope\n- Workshop-wide (no book selected)';
  }
  const lines: string[] = [];
  lines.push('## Book');
  lines.push(`- Title: ${b.title}`);
  if (b.subtitle) lines.push(`- Subtitle: ${b.subtitle}`);
  lines.push(`- Status: ${b.status}`);
  if (b.description) lines.push(`- Description: ${b.description}`);
  if (b.target_completion_date)
    lines.push(`- Target completion: ${b.target_completion_date}`);
  if (b.target_audience)
    lines.push(`- Target audience: ${b.target_audience}`);
  if (b.tags.length > 0) lines.push(`- Tags: ${b.tags.join(', ')}`);
  lines.push(`- Overall phase progress: ${b.phase_progress_avg}%`);
  return lines.join('\n');
}

function renderMemoryEntry(m: {
  id: string;
  title: string;
  era_date_estimate: string | null;
  when_in_life: string | null;
  location: string | null;
  body_snippet: string;
  emotion_tags: string[];
  content_tags: string[];
  sensitive_kinds: string[];
  source: string;
}): string {
  const lines: string[] = [];
  lines.push(`- [${m.id}] ${m.title}`);
  if (m.era_date_estimate || m.when_in_life)
    lines.push(
      `  - When: ${m.era_date_estimate ?? '?'}${m.when_in_life ? ` (${m.when_in_life})` : ''}`,
    );
  if (m.location) lines.push(`  - Where: ${m.location}`);
  if (m.body_snippet) lines.push(`  - Body: ${m.body_snippet}`);
  if (m.emotion_tags.length > 0)
    lines.push(`  - Emotion: ${m.emotion_tags.join(', ')}`);
  if (m.content_tags.length > 0)
    lines.push(`  - Content: ${m.content_tags.join(', ')}`);
  if (m.sensitive_kinds.length > 0)
    lines.push(`  - Sensitive: ${m.sensitive_kinds.join(', ')}`);
  return lines.join('\n');
}

function renderInterviewer(data: any): string {
  const lines: string[] = [];
  lines.push(renderBook(data.book));
  lines.push('');
  if (data.person) {
    const p = data.person;
    lines.push('## Person scope');
    lines.push(`- Name: ${p.canonical_name}`);
    if (p.aliases?.length > 0) lines.push(`- Aliases: ${p.aliases.join(', ')}`);
    if (p.relation) lines.push(`- Relation: ${p.relation}`);
    lines.push(`- Consent: ${p.consent_to_publish}`);
    if (p.birth_year) lines.push(`- Born: ${p.birth_year}`);
    if (p.death_year) lines.push(`- Died: ${p.death_year}`);
    if (p.notes) lines.push(`- Notes: ${p.notes}`);
    lines.push('');
  }
  lines.push(
    `## Recent memories (${data.recent_memories.length} chronologically)`,
  );
  if (data.recent_memories.length === 0) {
    lines.push('- (none on file yet)');
  } else {
    for (const m of data.recent_memories) lines.push(renderMemoryEntry(m));
  }
  if (data.person_memories?.length > 0) {
    lines.push('');
    lines.push(
      `## Memories referencing ${data.person?.canonical_name ?? 'person'} (${data.person_memories.length})`,
    );
    for (const m of data.person_memories) lines.push(renderMemoryEntry(m));
  }
  return lines.join('\n');
}

function renderChapterDrafter(data: any): string {
  const lines: string[] = [];
  lines.push(renderBook(data.book));
  lines.push('');
  if (data.chapter) {
    const c = data.chapter;
    lines.push('## Chapter');
    if (c.title) lines.push(`- Title: ${c.title}`);
    lines.push(`- Slug: ${c.slug ?? '(unset)'}`);
    lines.push(`- Position: ${c.position}`);
    lines.push(`- Status: ${c.status}`);
    if (c.summary) lines.push(`- Summary: ${c.summary}`);
    if (c.target_word_count != null)
      lines.push(`- Target word count: ${c.target_word_count}`);
  } else {
    lines.push('## Chapter\n- (no chapter selected — pick one to draft into)');
  }
  lines.push('');

  if (data.voice_profile) {
    const vp = data.voice_profile;
    lines.push(`## Voice profile (v${vp.version})`);
    lines.push(`- Summary: ${vp.style_summary}`);
    if (vp.style_adjectives.length > 0)
      lines.push(`- Adjectives: ${vp.style_adjectives.join(', ')}`);
    if (vp.style_rules.length > 0) {
      lines.push('- Rules:');
      for (const r of vp.style_rules) lines.push(`  - ${r}`);
    }
    if (vp.example_openings.length > 0) {
      lines.push('- Example openings:');
      for (const e of vp.example_openings)
        lines.push(`  - "${(e ?? '').toString().slice(0, 200)}"`);
    }
    lines.push(
      `- Trained on: ${vp.sample_count} samples (${vp.sample_word_count} words)`,
    );
  } else {
    lines.push('## Voice profile\n- (none active — drafter will use a neutral memoir register)');
  }
  lines.push('');

  lines.push(`## Source memories (${data.source_memories.length})`);
  if (data.source_memories.length === 0) {
    lines.push('- (no memories linked to this chapter — link some before drafting)');
  } else {
    for (const s of data.source_memories) {
      lines.push(
        `- [${s.memory_id}] ${s.memory_title} (weight=${s.weight}, when=${s.memory_era_date ?? s.memory_when_in_life ?? '?'})`,
      );
      if (s.sensitive_kinds?.length > 0)
        lines.push(`  - Sensitive: ${s.sensitive_kinds.join(', ')}`);
      if (s.notes) lines.push(`  - Notes: ${s.notes}`);
    }
  }
  lines.push('');

  lines.push(`## People referenced (${data.people.length})`);
  if (data.people.length === 0) {
    lines.push('- (none on file)');
  } else {
    for (const p of data.people) {
      const aliases =
        p.aliases?.length > 0 ? ` (aka ${p.aliases.join(', ')})` : '';
      lines.push(
        `- ${p.canonical_name}${aliases} — consent=${p.consent_to_publish}${p.relation ? `, ${p.relation}` : ''}`,
      );
    }
  }
  lines.push('');

  lines.push(`## Pseudonyms for this book (${data.pseudonyms.length})`);
  if (data.pseudonyms.length === 0) {
    lines.push('- (none — use canonical_name for "granted" people; refuse / ask for "pending"/"withheld")');
  } else {
    for (const ps of data.pseudonyms) {
      lines.push(
        `- ${ps.canonical_name} → "${ps.pseudonym}"${ps.applied ? ' (applied)' : ' (pending substitution)'}`,
      );
    }
  }
  lines.push('');

  if (data.sensitive_kinds?.length > 0) {
    lines.push(
      `## Sensitive material in source memories: ${data.sensitive_kinds.join(', ')}`,
    );
    lines.push(
      '(Apply Rule 3 footer; if any of {sexual, abuse, mental_health}, apply Rule 4 escalation.)',
    );
  }
  return lines.join('\n');
}

function renderNarrativeCritic(data: any): string {
  const lines: string[] = [];
  lines.push(renderBook(data.book));
  lines.push('');
  lines.push(`## Chapters (${data.chapters.length})`);
  if (data.chapters.length === 0) {
    lines.push('- (none yet)');
  } else {
    for (const c of data.chapters) {
      lines.push(
        `- #${c.position} "${c.title ?? '(untitled)'}" [status=${c.status}, target=${c.target_word_count ?? 'unset'}]`,
      );
      if (c.summary) lines.push(`  - ${c.summary}`);
    }
  }
  lines.push('');
  lines.push(`## Arcs (${data.arcs.length})`);
  if (data.arcs.length === 0) {
    lines.push('- (none — chapter order is by position only)');
  } else {
    for (const a of data.arcs) {
      const primary = a.is_primary ? ' [PRIMARY]' : '';
      lines.push(
        `- "${a.title}" (${a.kind}, ${a.chapter_count} chapters)${primary}`,
      );
      if (a.description) lines.push(`  - ${a.description}`);
    }
  }
  if (data.primary_arc_id) {
    lines.push('');
    lines.push(
      `Primary arc is set — critique chapter ordering against it. If the primary arc is "thematic" or "character_led", flag chapters that don't belong to any arc.`,
    );
  }
  return lines.join('\n');
}

function renderGeneral(data: any): string {
  const lines: string[] = [];
  lines.push(renderBook(data.book));
  lines.push('');
  const c = data.counts ?? {};
  if (data.book) {
    lines.push('## Book counts');
    lines.push(`- Chapters: ${c.chapter_count ?? 0}`);
    lines.push(`- Memories attached: ${c.memory_count ?? 0}`);
    lines.push('');
  }
  lines.push('## Workshop counts');
  lines.push(`- Books: ${c.book_count ?? 0}`);
  lines.push(`- People: ${c.person_count ?? 0}`);
  if (!data.book) lines.push(`- Memories: ${c.memory_count ?? 0}`);
  lines.push(`- Voice samples: ${c.voice_sample_count ?? 0}`);
  return lines.join('\n');
}

function renderContext(ctx: AutobiographerCoachContext): string {
  switch (ctx.mode) {
    case 'interviewer':
      return renderInterviewer(ctx.data);
    case 'chapter_drafter':
      return renderChapterDrafter(ctx.data);
    case 'narrative_critic':
      return renderNarrativeCritic(ctx.data);
    case 'general':
      return renderGeneral(ctx.data);
  }
}

/**
 * Compute the sensitive_kinds set that should drive footer rendering
 * for a given context. Currently only chapter_drafter context exposes
 * it directly; other modes return [].
 */
export function activeSensitiveKinds(ctx: AutobiographerCoachContext): string[] {
  if (ctx.mode === 'chapter_drafter') {
    return ctx.data.sensitive_kinds ?? [];
  }
  return [];
}

/**
 * Compose the system prompt from the role framing, the four hard rules,
 * the rendered context block, and (when applicable) the sensitive-content
 * footer instructions reified at the prompt level so the model knows
 * which footer to emit on this turn.
 */
export function buildSystemPrompt(
  ctx: AutobiographerCoachContext,
  mode: CoachMode,
): string {
  const kinds = activeSensitiveKinds(ctx);
  const parts: string[] = [
    'You are the Pantheon Autobiographer Coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ];

  if (shouldAppendSensitiveFooter(kinds)) {
    parts.push('');
    parts.push('## Footer instruction (this turn)');
    if (shouldRecommendProfessionalReader(kinds)) {
      parts.push(
        `Source memories carry trauma-facing tags: ${kinds.join(', ')}. End your response with the PROFESSIONAL-READER footer per Rule 4.`,
      );
    } else {
      parts.push(
        `Source memories carry sensitive tags: ${kinds.join(', ')}. End your response with the SENSITIVE-CONTENT footer per Rule 3.`,
      );
    }
  }

  return parts.join('\n');
}
