/**
 * Research OS coach — system prompt builder.
 *
 * Per-mode role framings on top of one set of THREE shared hard rules
 * and a mode-shaped context block. The canonical prompt is versioned
 * (bump `SYSTEM_PROMPT_VERSION` whenever the template materially
 * changes) so a historical session can be replayed against the prompt
 * it was authored under.
 *
 * Coach safety policy: light-weight (Filmmaker / Maker shape, not
 * Cyber / Health). Research deals with academic prose so credentials
 * aren't routinely exposed. The one safety teeth: methods_advisor MUST
 * refuse regulated professional advice — clinical / human-subjects
 * IRB / animal-use IACUC / hazmat — and refer the user to the
 * appropriate institutional body. See `./safety.ts` for the keyword
 * detection layer that primes the referral footer.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import type {
  ResearchCoachContext,
  CoachLitReviewerContext,
  CoachHypothesisCriticContext,
  CoachMethodsAdvisorContext,
  CoachGeneralContext,
} from './context';
import type { CoachMode } from './modes';
import {
  buildReferralFooter,
  detectRegulatedTopics,
  type RegulatedTopic,
} from './safety';

export const SYSTEM_PROMPT_VERSION = 'v1';

/**
 * The three hard rules that EVERY mode honors. methods_advisor leans
 * heaviest on rule 3 (regulated-advice refusal); the lit_reviewer /
 * hypothesis_critic / general modes inherit rules 1-2 as defensive
 * guardrails.
 */
export const HARD_RULES = `Hard rules (every mode):

1. NO FABRICATION. Never invent papers, hypotheses, results, citations,
   protocols, datasets, or evidence the user did not supply in the
   context block below. If the cluster is too thin to support the
   request, say so and offer a clarifying question instead of padding.
   Academic readers trust that what they're reading is grounded — this
   is the most important rule across every mode.

2. CITE SOURCE IDs. When you reference an item from the context block
   (a paper, hypothesis, prediction, falsifier, dataset, protocol),
   include its ID inline so the user can trace your reasoning. Format
   loosely as "[paper:<id>]" / "[hypothesis:<id>]" / etc. You're
   expected to use the exact IDs from the context block, not invent new
   ones.

3. REGULATED PROFESSIONAL ADVICE (methods_advisor only). Do not give
   clinical / medical advice, human-subjects research-design advice that
   would substitute for IRB review, animal-use protocol advice that
   would substitute for IACUC review, or hazardous-materials handling
   advice that would substitute for EHS review. When the user's question
   touches these areas, refuse the regulated portion and refer them to
   the appropriate institutional body. Phrasing template: "I can't
   substitute for [IRB / IACUC / EHS / licensed clinician] review —
   please consult [appropriate body]." Then offer adjacent help that
   stays inside your remit (e.g. methodological literature, statistical
   design questions).

Output plain markdown. No "as an AI" boilerplate, no apologetic
preamble. Keep responses tight; concrete recommendations beat broad
overviews.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  lit_reviewer: `You are the literature synthesizer. Voice: organized,
attentive to themes, calibrated to academic register. You read the
user's 30 most recent papers, plus (when scoped to an experiment) the
papers explicitly linked to that experiment via the references table,
plus any workshop-wide prior-art references.

Your job is to:

- Group papers by methodological or thematic cluster — and call out
  which papers anchor which cluster by ID.
- Surface contradictions between papers (paper A claims X, paper B
  claims ¬X) when the abstracts support that read.
- Identify gaps the user's collection doesn't cover (relative to the
  experiment scope if scoped, or relative to the cluster themes if
  workshop-scoped).
- Point at the 2-3 papers most worth re-reading for the user's
  immediate question.

Stay in lit-reviewer mode. Don't propose experiments or critique
hypotheses unless the user explicitly asks — suggest they switch modes
instead.`,

  hypothesis_critic: `You are the methodological skeptic. Voice: blunt,
craft-conscious, kind. You read the user's hypotheses (with status,
confidence, tags, full predictions, full falsifiers, and recent
evidence rows with polarity + source_kind), then critique:

- Confounders: variables the hypothesis statement glosses over that
  would compete to explain the predicted effect.
- Falsifiability: predictions / falsifiers that are not actually
  refutable as written (vague thresholds, no measurement clause,
  unbounded direction-only claims).
- Weak predictions: those whose magnitude / direction can't
  meaningfully distinguish the hypothesis from the null.
- Evidence asymmetry: hypotheses where the polarity of recent evidence
  doesn't match the user's current confidence level (overconfident
  given refutes, or underconfident given supports).

When critiquing, cite the specific prediction / falsifier / evidence
ID you're addressing. Don't rewrite the hypothesis — name the problem,
point at the row, suggest the direction of the fix. The user makes the
call.`,

  methods_advisor: `You are the experimental-design helper. Voice:
practical, methods-paper-fluent, conservative on safety. You read the
experiment's description, status, tags, target completion date; the
linked protocols (with pinned versions and the first 1KB of body_md);
the experiment's datasets (name, kind, size, archived flag); and the
reproducibility checklist (item_key + state).

Your job is to:

- Recommend additional controls the current protocol(s) don't have.
- Suggest sample sizes given the linked protocols / dataset shapes.
- Flag reproducibility checklist items that are open and likely to
  block reproduction (note the item_key and the state).
- Point at gaps between the experiment's stated description and what
  the protocol bodies actually cover.

You are bound by Rule 3 — regulated professional advice is OFF LIMITS.
If the user asks about clinical dosing, IRB protocols, IACUC, hazmat
handling, or anything that would normally require a regulated
practitioner, REFUSE the regulated portion and refer them to the
appropriate institutional body. You may discuss methodology adjacent
to the regulated topic (e.g. "the statistical design considerations
for a two-arm trial are X" is fine; "you should dose subjects with Y
mg of Z" is NOT fine).

methods_advisor REQUIRES an experiment scope. If the user is here
without one, point out the gap and ask them to open an experiment.`,

  general: `You are the stuck-PhD conversation partner. Voice:
patient, lateral-thinking, not pushy. You have access to ONLY the
workshop-level counts (experiments, hypotheses, papers) plus
experiment meta when scoped — no full paper / hypothesis / protocol
bodies.

When the user is stuck, your job is to help them think out loud, not
to advance the manuscript. Ask "what is this experiment actually
about, in one sentence?". Offer a status snapshot ("you have N
hypotheses, M experiments, P papers — most-recent experiment is X").
Suggest a small concrete next step ("draft a hypothesis from your
3 most-recent papers about thermal management").

If the user asks for substantive help (synthesize the literature,
critique hypotheses, design methods), suggest they switch to the
appropriate mode (lit_reviewer / hypothesis_critic /
methods_advisor) and rejoin the conversation from there.`,
};

// ─── Renderers ──────────────────────────────────────────────────────────

function renderExperiment(
  e: { id: string; name: string; description: string; status: string; tags: string[]; target_completion_date: string | null; phase_progress_avg: number } | null,
): string {
  if (!e) {
    return '## Scope\n- Workshop-wide (no experiment selected)';
  }
  const lines: string[] = [];
  lines.push('## Experiment');
  lines.push(`- ID: ${e.id}`);
  lines.push(`- Name: ${e.name}`);
  lines.push(`- Status: ${e.status}`);
  if (e.description) lines.push(`- Description: ${e.description}`);
  if (e.target_completion_date)
    lines.push(`- Target completion: ${e.target_completion_date}`);
  if (e.tags.length > 0) lines.push(`- Tags: ${e.tags.join(', ')}`);
  lines.push(`- Overall phase progress: ${e.phase_progress_avg}%`);
  return lines.join('\n');
}

function renderLitReviewer(data: CoachLitReviewerContext): string {
  const lines: string[] = [];
  lines.push(renderExperiment(data.experiment));
  lines.push('');
  lines.push(`## Recent papers (${data.recent_papers.length})`);
  if (data.recent_papers.length === 0) {
    lines.push('- (none in library yet)');
  } else {
    for (const p of data.recent_papers) {
      const tail = [
        p.authors_text ? p.authors_text : null,
        p.year != null ? String(p.year) : null,
        p.kind,
      ]
        .filter(Boolean)
        .join(' · ');
      lines.push(`- [${p.id}] ${p.title}${tail ? ` — ${tail}` : ''}`);
      if (p.tags.length > 0) lines.push(`  - Tags: ${p.tags.join(', ')}`);
      if (p.abstract_snippet)
        lines.push(`  - Abstract: ${p.abstract_snippet}`);
    }
  }
  if (data.experiment_references.length > 0) {
    lines.push('');
    lines.push(
      `## Experiment references (${data.experiment_references.length})`,
    );
    for (const r of data.experiment_references) {
      lines.push(
        `- [${r.paper_id}] ${r.paper_title} (${r.relevance})${r.notes ? ` — ${r.notes}` : ''}`,
      );
    }
  }
  if (data.prior_art_refs.length > 0) {
    lines.push('');
    lines.push(`## Workshop prior-art refs (${data.prior_art_refs.length})`);
    for (const r of data.prior_art_refs) {
      lines.push(`- [${r.paper_id}] ${r.paper_title}`);
    }
  }
  return lines.join('\n');
}

function renderHypothesisCritic(data: CoachHypothesisCriticContext): string {
  const lines: string[] = [];
  lines.push(renderExperiment(data.experiment));
  lines.push('');
  lines.push(`## Hypotheses (${data.hypotheses.length})`);
  if (data.hypotheses.length === 0) {
    lines.push('- (none on file)');
  } else {
    for (const h of data.hypotheses) {
      lines.push(
        `- [${h.id}] ${h.title} (status=${h.status}, confidence=${h.confidence})`,
      );
      lines.push(`  - If: ${h.if_clause}`);
      lines.push(`  - Then: ${h.then_clause}`);
      lines.push(`  - Because: ${h.because_clause}`);
      if (h.tags.length > 0) lines.push(`  - Tags: ${h.tags.join(', ')}`);
      if (h.description_snippet)
        lines.push(`  - Description: ${h.description_snippet}`);
      if (h.predictions.length > 0) {
        lines.push(`  - Predictions (${h.predictions.length}):`);
        for (const p of h.predictions) {
          lines.push(
            `    - [${p.id}] (${p.kind}, ${p.confidence}) ${p.text}`,
          );
        }
      }
      if (h.falsifiers.length > 0) {
        lines.push(`  - Falsifiers (${h.falsifiers.length}):`);
        for (const f of h.falsifiers) {
          lines.push(`    - [${f.id}] ${f.text}`);
          if (f.criterion_snippet)
            lines.push(`      - Criterion: ${f.criterion_snippet}`);
        }
      }
    }
  }
  lines.push('');
  lines.push(`## Recent evidence (${data.recent_evidence.length})`);
  if (data.recent_evidence.length === 0) {
    lines.push('- (none yet)');
  } else {
    for (const e of data.recent_evidence) {
      lines.push(
        `- [${e.id}] hypothesis=${e.hypothesis_id} polarity=${e.polarity} source=${e.source_kind}`,
      );
      if (e.notes_snippet) lines.push(`  - Notes: ${e.notes_snippet}`);
    }
  }
  return lines.join('\n');
}

function renderMethodsAdvisor(data: CoachMethodsAdvisorContext): string {
  const lines: string[] = [];
  lines.push(renderExperiment(data.experiment));
  if (data.experiment_description) {
    lines.push('');
    lines.push('## Experiment description');
    lines.push(data.experiment_description);
  }
  lines.push('');
  lines.push(`## Linked protocols (${data.protocols.length})`);
  if (data.protocols.length === 0) {
    lines.push('- (none pinned — link a protocol from the experiment page)');
  } else {
    for (const p of data.protocols) {
      lines.push(
        `- [${p.protocol_id}] ${p.title} (kind=${p.kind}, pinned v${p.pinned_version})`,
      );
      if (p.body_snippet) lines.push(`  - Body: ${p.body_snippet}`);
    }
  }
  lines.push('');
  lines.push(`## Datasets (${data.datasets.length})`);
  if (data.datasets.length === 0) {
    lines.push('- (none registered)');
  } else {
    for (const d of data.datasets) {
      const size = d.size_bytes != null ? ` ${d.size_bytes}B` : '';
      const arch = d.archived ? ' [archived]' : '';
      lines.push(`- [${d.id}] ${d.name} (${d.kind})${size}${arch}`);
    }
  }
  lines.push('');
  lines.push(`## Reproducibility checklist (${data.reproducibility.length})`);
  if (data.reproducibility.length === 0) {
    lines.push('- (no items — defaults will seed on next visit)');
  } else {
    for (const r of data.reproducibility) {
      lines.push(`- ${r.item_key}: ${r.state}`);
    }
  }
  return lines.join('\n');
}

function renderGeneral(data: CoachGeneralContext): string {
  const lines: string[] = [];
  lines.push(renderExperiment(data.experiment));
  lines.push('');
  lines.push('## Workshop counts');
  lines.push(`- Experiments: ${data.counts.experiments}`);
  lines.push(`- Hypotheses: ${data.counts.hypotheses}`);
  lines.push(`- Papers: ${data.counts.papers}`);
  return lines.join('\n');
}

function renderContext(ctx: ResearchCoachContext): string {
  switch (ctx.mode) {
    case 'lit_reviewer':
      return renderLitReviewer(ctx.data);
    case 'hypothesis_critic':
      return renderHypothesisCritic(ctx.data);
    case 'methods_advisor':
      return renderMethodsAdvisor(ctx.data);
    case 'general':
      return renderGeneral(ctx.data);
  }
}

/**
 * Compose the system prompt from the role framing, the three hard
 * rules, the rendered context block, and (when the mode is
 * methods_advisor AND the user prompt triggers a regulated topic) the
 * referral footer reified at the prompt level so the model knows which
 * institutional body to point at on THIS turn.
 *
 * `userPrompt` is the most recent user turn — passed by the route layer
 * so the safety detection layer can scan it on the way into the system
 * prompt. Other modes accept an empty / undefined string; only
 * methods_advisor uses the detection result.
 */
export function buildSystemPrompt(
  ctx: ResearchCoachContext,
  mode: CoachMode,
  userPrompt?: string,
): string {
  const parts: string[] = [
    'You are the Pantheon Research Coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ];

  if (mode === 'methods_advisor' && userPrompt) {
    const topics: RegulatedTopic[] = detectRegulatedTopics(userPrompt);
    const footer = buildReferralFooter(topics);
    if (footer) {
      parts.push('');
      parts.push(footer);
    }
  }

  return parts.join('\n');
}
