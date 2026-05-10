/**
 * Coach system prompt.
 *
 * The canonical prompt is versioned (``SYSTEM_PROMPT_VERSION``) and stored
 * on each conversation row. Bump the version when the template materially
 * changes so historical conversations can be replayed with the prompt
 * they were trained against.
 */

import type { CoachContext } from './context';

export const SYSTEM_PROMPT_VERSION = 'v1';

const CONTRACT = `You are the Health OS coach inside Tiresias. You support the user with
gentle, evidence-grounded reflection on their physical and mental wellness.
You are NOT a clinician. You operate under five hard rules:

1. Never offer a diagnosis. Phrase mental-health observations as "what I'm
   hearing" or "what the screener suggests" — never "you have."
2. If the user expresses suicidal ideation or self-harm, immediately defer
   to the crisis-safety system: surface the 988 Suicide & Crisis Lifeline
   (call or text 988, or chat at https://988lifeline.org) and the Crisis
   Text Line (text HOME to 741741). Then gently offer to stay with them
   while they reach out.
3. Never prescribe or recommend medication or supplements. For anything
   pharmacological, point to "your prescriber," "your doctor," or — for
   nutrition — "a registered dietitian."
4. Don't claim memory you don't have. You only see this conversation and
   the context block below. You don't remember prior chats unless what
   you need is in the context block.
5. Output plain markdown. No "as an AI" boilerplate, no agentic flourishes,
   no apologies for being a language model.

When the user asks you to take an action you have a tool for (logging a
mood check-in, a meal, an activity; suggesting a workout; surfacing a
recent journal entry; saving a reflection prompt) — call the tool. Don't
narrate that you're "about to" call it. Don't ask permission for low-stakes
writes the user clearly requested.

If a screener result is severity ≥ moderately_severe (PHQ-9 ≥ 15, GAD-7 ≥ 15,
PSS-10 ≥ 27), encourage talking with a licensed professional. Don't be
preachy about it; mention it once, then continue the conversation the user
actually came for.`;

function renderContext(ctx: CoachContext): string {
  const lines: string[] = [];
  lines.push('## Current snapshot');
  const p = ctx.profile;
  const profileBits: string[] = [];
  if (p.age !== undefined) profileBits.push(`age ${p.age}`);
  if (p.biological_sex) profileBits.push(p.biological_sex);
  if (p.height_cm !== undefined) profileBits.push(`${p.height_cm} cm`);
  if (p.weight_kg !== undefined) profileBits.push(`${p.weight_kg} kg`);
  if (p.fitness_level) profileBits.push(`activity: ${p.fitness_level}`);
  lines.push(
    `- Profile: ${profileBits.length ? profileBits.join(', ') : 'not provided'}`,
  );

  if (ctx.recent_screeners.length === 0) {
    lines.push('- Screeners: none on file');
  } else {
    const screenerStr = ctx.recent_screeners
      .map(
        (s) =>
          `${s.kind.toUpperCase()}=${s.score} (${s.severity}, ${s.completed_at.slice(0, 10)})`,
      )
      .join('; ');
    lines.push(`- Latest screeners: ${screenerStr}`);
  }

  if (ctx.recent_mood_7d.length === 0) {
    lines.push('- Mood (last 7d): no check-ins');
  } else {
    const moodAvg =
      ctx.recent_mood_7d
        .map((m) => m.mood ?? 0)
        .filter((n) => n > 0)
        .reduce((a, b) => a + b, 0) / Math.max(ctx.recent_mood_7d.length, 1);
    const anxAvg =
      ctx.recent_mood_7d
        .map((m) => m.anxiety ?? 0)
        .filter((n) => n > 0)
        .reduce((a, b) => a + b, 0) / Math.max(ctx.recent_mood_7d.length, 1);
    lines.push(
      `- Mood (last 7d, ${ctx.recent_mood_7d.length} check-ins): mood avg ${moodAvg.toFixed(1)}/10, anxiety avg ${anxAvg.toFixed(1)}/10`,
    );
  }

  if (ctx.recent_journal_titles_14d.length > 0) {
    lines.push(
      `- Journal (last 14d, ${ctx.recent_journal_titles_14d.length} entries). Most recent: "${ctx.recent_journal_titles_14d[0]!.body_excerpt}"`,
    );
  } else {
    lines.push('- Journal (last 14d): no entries');
  }

  if (ctx.recent_cbt_logs_14d.length > 0) {
    const kinds = ctx.recent_cbt_logs_14d.map((l) => l.kind).join(', ');
    lines.push(`- CBT exercises (last 14d): ${ctx.recent_cbt_logs_14d.length} (${kinds})`);
  } else {
    lines.push('- CBT exercises (last 14d): none');
  }

  if (ctx.recent_meditation_14d.length > 0) {
    const totalMin = ctx.recent_meditation_14d.reduce(
      (a, m) => a + m.duration_min,
      0,
    );
    lines.push(
      `- Meditation (last 14d): ${ctx.recent_meditation_14d.length} sessions, ${totalMin} min total`,
    );
  } else {
    lines.push('- Meditation (last 14d): none');
  }

  if (ctx.nutrition_7d_avg) {
    const n = ctx.nutrition_7d_avg;
    lines.push(
      `- Nutrition (7d avg/day): ${n.kcal} kcal, ${n.protein_g}g P / ${n.carbs_g}g C / ${n.fat_g}g F`,
    );
  } else {
    lines.push('- Nutrition (last 7d): no meals logged');
  }

  if (ctx.activity_7d_total) {
    const a = ctx.activity_7d_total;
    lines.push(
      `- Activity (last 7d): ${a.sessions} sessions, ${a.duration_min} min total, ${a.kcal_burned} kcal burned`,
    );
  } else {
    lines.push('- Activity (last 7d): no sessions logged');
  }

  if (ctx.active_meal_plan) {
    lines.push(
      `- Active meal plan: week of ${ctx.active_meal_plan.week_start_date} (${ctx.active_meal_plan.slot_count} slots)`,
    );
  }
  if (ctx.active_activity_plan) {
    lines.push(
      `- Active activity plan: week of ${ctx.active_activity_plan.week_start_date} (${ctx.active_activity_plan.slot_count} slots)`,
    );
  }

  lines.push(
    `- Intensity suggestion right now: ${ctx.intensity_suggestion.intensity} — ${ctx.intensity_suggestion.rationale}`,
  );

  return lines.join('\n');
}

const CRISIS_REMINDER = `If the user expresses suicidal ideation or self-harm,
immediately surface the 988 Suicide & Crisis Lifeline (call or text 988, or
chat at https://988lifeline.org) and the Crisis Text Line (text HOME to 741741).
Then gently offer to stay with them while they reach out.`;

export function buildSystemPrompt(ctx: CoachContext): string {
  return [CONTRACT, '', renderContext(ctx), '', CRISIS_REMINDER].join('\n');
}
