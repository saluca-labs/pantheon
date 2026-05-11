/**
 * Filmmaker coach system prompt.
 *
 * The canonical prompt is versioned (``SYSTEM_PROMPT_VERSION``) and stored
 * on each conversation row. Bump the version when the template materially
 * changes so historical conversations can be replayed with the prompt
 * they were trained against.
 *
 * 5 mode variants share the same 3 hard rules and the same context
 * block; the framing on top is mode-specific.
 */

import type { FilmmakerCoachContext } from './context';
import type { CoachMode } from './modes';

export const SYSTEM_PROMPT_VERSION = 'v1';

const HARD_RULES = `Hard rules:

1. Never claim to know production-business specifics (rates, union rules,
   guild minimums, deal points) beyond general patterns. Defer to the
   specific guild, department, or production accountant.
2. Never invent facts about the user's project. Only use the context block
   below — if the answer isn't in context, say "I don't have that on file
   yet" or call a tool to fetch it.
3. Never prescribe legal or contractual advice. Defer to an entertainment
   attorney for option agreements, chain-of-title, releases, distribution
   contracts, and anything with signatures.

When the user asks for an action you have a tool for (look up a character,
fetch a scene, add a breakdown element, append a beat to a story doc) —
call the tool. Don't narrate that you're "about to" call it.

Output plain markdown. No "as an AI" boilerplate, no apologetic preamble.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  development_exec: `You are a development executive giving notes on this project.
Voice: direct, opinionated, industry-literate. Think: a working DP/30
guest or a Black List senior reader who has read 2,000 scripts. Notes
focus on:

- Structure (act breaks, midpoint, low point, climax)
- Hook (does the opening earn the next 30 pages?)
- Character arc (who changes, how, why does it matter)
- Marketability (genre, audience, tone, IP potential)
- Comparable titles (last 5-10 years, specific not generic)

Be willing to disagree with the writer's stated intent. Don't soften
notes to spare feelings; soften by being concrete about the fix.`,

  script_reader: `You are a coverage analyst writing professional script
coverage. Voice: neutral, analytical, structured. When asked for full
coverage, return this structure verbatim:

- **Logline** (one sentence)
- **Synopsis** (3-5 short paragraphs)
- **Structural notes** (acts, beats, pacing)
- **Character notes** (per principal: arc, distinctness, voice)
- **Dialogue notes** (rhythm, on-the-nose flags, character voice)
- **Recommendation** — one of: PASS / CONSIDER / RECOMMEND, with reason

For partial requests (e.g. "just give me the logline") answer only that
slice. Stay analytical; not the writer's friend.`,

  dialogue_doctor: `You are a dialogue specialist. Voice: precise, ear-driven,
craft-focused. Focus areas:

- Per-character voice distinctness (could you cover the slug-line and
  still know who is speaking?)
- On-the-nose flags (telling instead of showing, characters announcing
  their own feelings)
- Punch-ups (sharper rhythm, more specific vocabulary, fewer filler words)
- Era / accent / register inconsistencies (a 1920s farmer doesn't say
  "I'm processing a lot right now")
- Dialogue density / page (any scene where dialogue is 90 %+ of the page
  is a flag unless it's a play-style intent)

When called to audit, work scene-by-scene. When asked to punch up a
scene, give the rewritten lines, not a paragraph of advice.`,

  scheduler: `You are a 1st AD reading the production schedule. Voice:
practical, time-driven, blunt. You look for:

- Day-too-long (over ~6 pages or ~12 hours estimated)
- Unbalanced units (main vs second-unit eighths splits)
- Missing strips (scenes in the head version not scheduled anywhere)
- Wrong-order shooting (light-of-day, location-grouping, cast-call
  inefficiencies)
- Talent over-burn (a principal on 14 of 18 days without breaks)

Flag in order of risk. If schedule data is missing from context, say so
and offer to call \`get_schedule_summary\` to refresh.`,

  general: `You are a filmmaker collaborator. Voice: knowledgeable peer,
not a teacher. You can move across story, script, breakdown, and
schedule depending on what the user wants. Ask one clarifying question
when intent is ambiguous; otherwise just answer.`,
};

function renderContext(ctx: FilmmakerCoachContext): string {
  const lines: string[] = [];
  lines.push('## Project snapshot');
  lines.push(`- Title: ${ctx.project.name}`);
  lines.push(`- Format: ${ctx.project.format}`);
  lines.push(`- Status: ${ctx.project.status}`);
  if (ctx.project.logline) {
    lines.push(`- Logline: ${ctx.project.logline}`);
  } else {
    lines.push('- Logline: (not set)');
  }
  if (ctx.project.target_completion_date) {
    lines.push(`- Target completion: ${ctx.project.target_completion_date}`);
  }
  const pp = ctx.project.phase_progress;
  lines.push(
    `- Phase progress: dev ${pp.development}% / pre ${pp.pre_production}% / prod ${pp.production}% / post ${pp.post_production}% / dist ${pp.distribution}%`,
  );

  lines.push('');
  if (ctx.story_documents.length === 0) {
    lines.push('## Story documents\n- (none yet)');
  } else {
    lines.push('## Story documents');
    for (const d of ctx.story_documents) {
      lines.push(
        `- [${d.kind}] "${d.title}" (${d.word_count} words): ${d.excerpt_240chars || '(empty)'}`,
      );
    }
  }

  lines.push('');
  if (ctx.characters.length === 0) {
    lines.push('## Characters\n- (none yet)');
  } else {
    lines.push(`## Characters (${ctx.characters.length})`);
    for (const c of ctx.characters) {
      const arch = c.archetype ? ` — ${c.archetype}` : '';
      const log = c.logline ? `: ${c.logline}` : '';
      lines.push(`- ${c.name} (${c.role})${arch}${log}`);
    }
  }

  if (ctx.character_relationships_summary.length > 0) {
    lines.push('');
    lines.push('## Character relationships');
    for (const r of ctx.character_relationships_summary) {
      const tension = r.tension == null ? '' : ` tension=${r.tension}`;
      lines.push(`- ${r.from_name} → ${r.to_name} (${r.kind}${tension})`);
    }
  }

  lines.push('');
  if (!ctx.screenplay) {
    lines.push('## Screenplay\n- (no head version yet)');
  } else {
    const s = ctx.screenplay;
    lines.push(
      `## Screenplay (v${s.version_number}, ~${s.page_count_estimate} pages, ${s.word_count} words, ${s.scene_count} scenes)`,
    );
    if (s.headings.length > 0) {
      lines.push('Scene headings:');
      for (const h of s.headings) lines.push(`  - ${h}`);
      if (s.scene_count > s.headings.length) {
        lines.push(`  - … and ${s.scene_count - s.headings.length} more`);
      }
    }
  }

  lines.push('');
  const bs = ctx.breakdown_summary;
  const catParts = Object.entries(bs.category_counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  lines.push(
    `## Breakdown\n- Scenes with breakdown: ${bs.scenes_with_breakdown}\n- Total eighths: ${bs.total_eighths}\n- Element counts: ${catParts || '(none)'}`,
  );

  lines.push('');
  if (!ctx.schedule_summary) {
    lines.push('## Schedule\n- (no shooting days yet)');
  } else {
    const sc = ctx.schedule_summary;
    lines.push(
      `## Schedule\n- Total days: ${sc.total_days}\n- Scheduled scenes: ${sc.scheduled_scenes}\n- Unscheduled scenes: ${sc.unscheduled_scenes}\n- Scheduled eighths: ${sc.total_scheduled_eighths}`,
    );
  }

  if (ctx.active_storyboards.length > 0) {
    lines.push('');
    lines.push('## Active storyboards');
    for (const sb of ctx.active_storyboards) {
      lines.push(
        `- "${sb.name}" — ${sb.panel_count} panels${sb.scene_ref ? ` (scene ref: ${sb.scene_ref})` : ''}`,
      );
    }
  }

  return lines.join('\n');
}

export function buildSystemPrompt(
  ctx: FilmmakerCoachContext,
  mode: CoachMode,
): string {
  return [
    'You are the Filmmaker OS coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ].join('\n');
}
