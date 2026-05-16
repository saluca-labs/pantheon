/**
 * Creator OS coach — system prompt builder.
 *
 * Per-mode role framings on top of one set of shared hard rules and a
 * mode-shaped context block. The canonical prompt is versioned (bump
 * `SYSTEM_PROMPT_VERSION` whenever the template materially changes) so a
 * historical session can be replayed against the prompt it was authored
 * under.
 *
 * Coach safety policy is enforced by the prompt only — there's no
 * content classifier, no PII redaction, no token sniffing. Creator coach
 * is a low-harm domain without secret-redaction needs.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import type {
  CreatorCoachContext,
  CoachStrategistContext,
  CoachWritingContext,
  CoachAudienceContext,
  CoachMonetizationContext,
  CoachGeneralContext,
  CoachPostSummary,
} from './context';
import type { CoachMode } from './modes';

export const SYSTEM_PROMPT_VERSION = 'v1';

const HARD_RULES = `Hard rules:

1. Never invent metrics, audience numbers, revenue figures, or engagement
   statistics. Only reference data present in the context block below. If
   the answer isn't in context, say "I don't have that on file yet" and
   tell the user where to find or enter it.
2. Never generate plagiarized content or verbatim passages from copyrighted
   works. You can discuss structure, tone, and technique — you cannot
   reproduce substantial portions of protected material.
3. Never give legal, financial, or tax advice. Contracts, copyright
   registration, trademark, business entity structure, tax treatment of
   creator income — defer to an attorney or CPA. Inform the user, don't
   license them.

Output plain markdown. No "as an AI" boilerplate, no apologetic
preamble. Keep responses tight; concrete recommendations beat broad
overviews.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  content_strategist: `You are the Creator Content Strategist. Voice: editorial,
trend-aware, platform-savvy. You read the user's recent posts, notes, books,
and calendar, then:

- Propose topic clusters and content series based on what they've already
  written — extend, don't contradict.
- Build realistic editorial calendars that respect their publishing cadence.
- Identify content gaps: topics their audience would want that they haven't
  covered.
- Suggest cross-channel repurposing: blog post → newsletter → social thread
  → podcast episode.
- When scoped to a post or book: map that piece into a larger content strategy.

Stay strategy-mode. Don't drift into line-editing or writing craft unless
the user explicitly asks.`,

  writing_coach: `You are the Creator Writing Coach. Voice: constructive,
specific, craft-focused. You read the user's drafts, notes, and recent
published work, then:

- Review drafts for structure, clarity, tone, and narrative arc.
- Suggest headline alternatives that are specific and testable.
- Flag repetition, weak transitions, buried ledes, and passive-voice overuse.
- Offer concrete rewrite suggestions — show before/after snippets.
- When scoped to a draft: give a full editorial review — what works, what
  doesn't, what to fix.

Do not rewrite the user's work as your own. Suggest; don't replace. Always
preserve the user's voice — your job is to sharpen it, not overwrite it.`,

  audience_builder: `You are the Creator Audience Builder. Voice: growth-minded,
data-aware, community-focused. You read subscriber stats, post performance,
and engagement patterns, then:

- Identify which content types and topics drive the most engagement.
- Suggest growth tactics: lead magnets, cross-promotion, platform expansion.
- Analyze subscriber conversion funnels — where are you losing people?
- Flag engagement signals: which posts get shared, commented on, or bookmarked.
- Recommend community-building moves: ask-me-anything threads, reader
  spotlights, collaborative content.

When the user asks "how do I grow?", give a numbered priority list of
actionable tactics — not abstract theory.`,

  monetization_advisor: `You are the Creator Monetization Advisor. Voice:
pragmatic, revenue-aware, audience-respecting. You read pricing info,
subscriber tiers, and product data, then:

- Assess pricing against audience size and engagement — what's the right
  tier structure?
- Identify sponsorship-readiness: is the audience large and targeted enough?
- Suggest product-market pivots: what else could this audience pay for?
- Flag revenue concentration risk: too dependent on one channel or sponsor.
- Recommend pricing experiments: limited-time offers, tier restructuring,
  bundling.
- When the user asks about money: lead with the numbers, then the strategy.

Stay monetization-mode. Don't drift into audience growth or content strategy
unless the user explicitly asks.`,

  general: `You are a Creator Coach. Voice: knowledgeable peer, not a
consultant. You can move across content strategy, writing craft, audience
growth, and monetization as the user's question demands, but you stay
grounded in the creator's actual body of work. When intent is ambiguous,
ask one clarifying question; otherwise just answer.

Apply the hard rules consistently: never invent data, never plagiarize,
defer regulated advice.`,
};

function renderStrategist(data: CoachStrategistContext): string {
  const lines: string[] = [];
  lines.push('## Content strategy context');

  const recentPosts = data.recent_posts ?? [];
  if (recentPosts.length === 0) {
    lines.push('- Recent posts: (none)');
  } else {
    lines.push(`## Recent posts (${recentPosts.length})`);
    for (const p of recentPosts.slice(0, 15)) {
      lines.push(
        `- ${p.title} [status=${p.status}, published=${p.published_at ?? 'draft'}, categories=${(p.categories ?? []).join(', ') || 'none'}]`,
      );
    }
  }
  lines.push('');

  const recentNotes = data.recent_notes ?? [];
  if (recentNotes.length === 0) {
    lines.push('## Recent notes\n- (none)');
  } else {
    lines.push(`## Recent notes (${recentNotes.length})`);
    for (const n of recentNotes.slice(0, 10)) {
      lines.push(`- ${n.title} [updated=${n.updated_at?.slice(0, 10)}]`);
    }
  }
  lines.push('');

  const books = data.books ?? [];
  if (books.length === 0) {
    lines.push('## Books\n- (none)');
  } else {
    lines.push(`## Books (${books.length})`);
    for (const b of books.slice(0, 5)) {
      lines.push(`- ${b.title} [status=${b.status}, word_count=${b.word_count ?? 0}]`);
    }
  }

  return lines.join('\n');
}

function renderWriting(data: CoachWritingContext): string {
  const lines: string[] = [];
  lines.push('## Writing coach context');

  if (data.scoped_post) {
    lines.push('');
    lines.push('## Active draft');
    const sp = data.scoped_post as CoachWritingContext['scoped_post'] & {
      word_count?: number | null;
      content?: string | { slice(start: number, end: number): string };
    };
    lines.push(`- Title: ${sp!.title}`);
    lines.push(`- Status: ${sp!.status}`);
    lines.push(`- Word count: ${sp!.word_count ?? 'unknown'}`);
    lines.push(`- Categories: ${(sp!.categories ?? []).join(', ') || 'none'}`);
    if (sp!.excerpt) {
      lines.push(`- Excerpt: "${sp!.excerpt.slice(0, 200)}"`);
    }
    if (sp!.content) {
      const content = sp!.content as { slice(start: number, end: number): string };
      const preview = content.slice(0, 3000);
      lines.push(`- Content preview (first ${preview.length} chars):`);
      lines.push('```');
      lines.push(preview);
      lines.push('```');
    }
  }

  if (data.scoped_book) {
    lines.push('');
    lines.push('## Active book');
    const sb = data.scoped_book;
    lines.push(`- Title: ${sb.title}`);
    lines.push(`- Status: ${sb.status}`);
    lines.push(`- Word count: ${sb.word_count ?? 'unknown'}`);
    if (sb.description) {
      lines.push(`- Description: "${sb.description.slice(0, 300)}"`);
    }
  }

  const recentPosts = data.recent_posts ?? [];
  if (recentPosts.length > 0) {
    lines.push('');
    lines.push(`## Recent published posts (${recentPosts.length})`);
    for (const p of recentPosts.slice(0, 5)) {
      lines.push(`- ${p.title} [${p.published_at?.slice(0, 10)}]`);
    }
  }

  return lines.join('\n');
}

function renderAudience(data: CoachAudienceContext): string {
  const lines: string[] = [];
  lines.push('## Audience context');

  const subs = data.subscriber_stats ?? {};
  lines.push(`- Total subscribers: ${subs.total ?? 0}`);
  lines.push(`- Active subscribers: ${subs.active ?? 0}`);
  lines.push(`- Unsubscribed: ${subs.unsubscribed ?? 0}`);

  lines.push('');

  const postPerf = data.post_performance ?? [];
  if (postPerf.length === 0) {
    lines.push('## Post performance\n- (no data)');
  } else {
    lines.push(`## Post performance (${postPerf.length})`);
    for (const pp of postPerf.slice(0, 10) as Array<
      CoachPostSummary & { view_count?: number | null }
    >) {
      lines.push(
        `- ${pp.title}: ${pp.view_count ?? 0} views, published ${pp.published_at?.slice(0, 10) ?? 'unknown'}`,
      );
    }
  }

  const recentPosts = data.recent_posts ?? [];
  if (recentPosts.length > 0) {
    lines.push(`\n## Recent posts (${recentPosts.length})`);
    for (const p of recentPosts.slice(0, 5)) {
      lines.push(`- ${p.title} [status=${p.status}]`);
    }
  }

  return lines.join('\n');
}

function renderMonetization(data: CoachMonetizationContext): string {
  const lines: string[] = [];
  lines.push('## Monetization context');

  const pricing = data.pricing_info ?? {};
  if (Object.keys(pricing).length > 0) {
    lines.push('- Pricing tiers:');
    for (const [tier, price] of Object.entries(pricing)) {
      lines.push(`  - ${tier}: ${price}`);
    }
  } else {
    lines.push('- Pricing: (not configured)');
  }

  const books = data.books ?? [];
  if (books.length > 0) {
    lines.push(`\n## Books/products (${books.length})`);
    for (const b of books.slice(0, 5)) {
      lines.push(`- ${b.title} [status=${b.status}]`);
    }
  }

  const subs = data.subscriber_stats ?? {};
  if (subs.total > 0) {
    lines.push(`\n- Total subscribers: ${subs.total}`);
    lines.push(`- Active subscribers: ${subs.active ?? 0}`);
  }

  return lines.join('\n');
}

function renderGeneral(data: CoachGeneralContext): string {
  const lines: string[] = [];
  lines.push('## Creator snapshot');

  const subs = data.subscriber_stats ?? {};
  lines.push(`- Subscribers: ${subs.total ?? 0} total, ${subs.active ?? 0} active`);

  const posts = data.recent_posts ?? [];
  lines.push(`- Posts: ${posts.length} recent`);
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  lines.push(`- Scheduled posts: ${scheduled.length}`);

  const notes = data.recent_notes ?? [];
  lines.push(`- Notes: ${notes.length} recent`);

  const books = data.books ?? [];
  lines.push(`- Books: ${books.length}`);

  return lines.join('\n');
}

function renderContext(ctx: CreatorCoachContext): string {
  switch (ctx.mode) {
    case 'content_strategist':
      return renderStrategist(ctx.data);
    case 'writing_coach':
      return renderWriting(ctx.data);
    case 'audience_builder':
      return renderAudience(ctx.data);
    case 'monetization_advisor':
      return renderMonetization(ctx.data);
    case 'general':
      return renderGeneral(ctx.data);
  }
}

export function buildSystemPrompt(
  ctx: CreatorCoachContext,
  mode: CoachMode,
): string {
  return [
    'You are the Pantheon Creator Coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ].join('\n');
}
