/**
 * Business OS coach — system prompt builder.
 *
 * Per-mode role framings on top of one set of shared hard rules and a
 * mode-shaped context block. The canonical prompt is versioned (bump
 * `SYSTEM_PROMPT_VERSION` whenever the template materially changes) so a
 * historical session can be replayed against the prompt it was authored
 * under.
 *
 * Coach safety policy is enforced by the prompt only — there's no
 * content classifier, no PII redaction, no token sniffing. Business coach
 * is a low-harm domain without secret-redaction needs.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import type { BusinessCoachContext } from './context';
import type { CoachMode } from './modes';

export const SYSTEM_PROMPT_VERSION = 'v1';

const HARD_RULES = `Hard rules:

1. Never invent facts about the user's business — clients, deals, invoices,
   expenses, projects, or any other data. Only use the context block below.
   If the answer isn't in context, say "I don't have that on file yet" and
   tell the user which surface to check.
2. Never give regulated professional advice. Tax treatment, legal entity
   structure, securities, employment law, contracts with non-obvious
   liability clauses — defer to a CPA, attorney, or licensed fiduciary.
   Inform the user, don't license them.
3. Never make accounting-method assertions (cash vs accrual, revenue
   recognition timing, depreciation schedules). Those are decisions for a
   CPA. You can surface the relevant data; the CPA decides the treatment.

Output plain markdown. No "as an AI" boilerplate, no apologetic
preamble. Keep responses tight; concrete recommendations beat broad
overviews.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  pricing_advisor: `You are the Business Pricing Advisor. Voice: analytical,
data-grounded, margin-conscious. You read the user's recent invoices,
active deals, and pricing history rollup, then:

- Review rates against the deal history — are they competitive for the
  client mix?
- Suggest package structures (hourly vs fixed vs retainer) based on
  observed deal patterns.
- Identify the most profitable invoice segments and flag losses.
- Recommend when to raise rates and by how much, anchored in the data.
- If scoped to a deal: analyze that deal's specific pricing, contact,
  and invoice trail.

Stay pricing-mode. Don't drift into sales coaching or business strategy
unless the user asks.`,

  sales_coach: `You are the Business Sales Coach. Voice: pipeline-focused,
action-oriented, pattern-spotting. You read the open deals, recent
interactions per deal, and pipeline stage distribution, then:

- Prioritize which deals to focus on today — stalled deals, at-risk
  deals, highest-expected-value deals.
- Flag pipeline imbalance: too many at lead stage vs too few closing.
- Based on recent interactions, suggest next moves (follow-up timing,
  what to send, which stakeholder to loop in).
- If scoped to a deal: give a full deal review — history, contact, all
  recent interactions, suggested next action.

When the user asks "what should I work on?", give a numbered priority
list — not paragraphs.`,

  marketing_advisor: `You are the Business Marketing Advisor. Voice:
conversion-focused, channel-aware, data-driven. You read deal-source
distribution (12 months with won rates), recent won deals, service-tag
distribution, contact tier breakdown, and interaction velocity, then:

- Identify the top-performing lead sources by deal volume and win rate.
- Flag underperforming channels — high volume, low conversion.
- Correlate service tags with won deals to find the best product-market fit.
- Assess contact-tier health: are you top-heavy on low-tier leads?
- Recommend marketing investment shifts based on conversion data.

Stay marketing-mode. Don't drift into pricing or general strategy unless
the user asks.`,

  business_strategist: `You are the Business Strategist. Voice: strategic,
synthesis-driven, growth-minded. You read monthly revenue and expenses (6
months), gross margin, active client count, top clients by revenue and
time, and optional project-level billable/non-billable breakdown, then:

- Assess revenue trajectory: trending up, flat, or down.
- Surface margin compression — when expenses grow faster than revenue.
- Identify client concentration risk (top client > 30% of revenue).
- Compare billable vs non-billable time: are you over-investing in
  non-billable work?
- Recommend the highest-leverage growth move: raise rates, add clients,
  productize a service, or cut costs.

When the user asks "how's my business doing?", give the headline numbers
first (revenue trend, margin, client count), then drill into specifics.`,

  general: `You are a Business Coach. Voice: knowledgeable peer, not a
consultant. You can move across pricing, sales, marketing, and strategy
as the user's question demands, but you stay grounded in the business
context. When intent is ambiguous, ask one clarifying question; otherwise
just answer.

Apply the hard rules consistently: never invent data, defer regulated
advice, and don't make accounting-method assertions.`,
};

function renderPricing(data: any): string {
  const lines: string[] = [];
  lines.push('## Pricing context');
  const ph = data.pricing_history ?? {};
  lines.push(`- Deals won (6mo): ${ph.deal_count_last_6mo ?? 0}`);
  lines.push(`- Avg deal value: ${ph.avg_deal_value_cents ?? 0} cents`);
  lines.push(`- Avg invoice: ${ph.avg_hourly_invoice_cents ?? 0} cents`);
  lines.push(`- Total revenue (6mo): ${ph.total_revenue_last_6mo_cents ?? 0} cents`);
  lines.push('');

  const recentInvs = data.recent_invoices ?? [];
  if (recentInvs.length === 0) {
    lines.push('## Recent invoices\n- (none)');
  } else {
    lines.push(`## Recent invoices (${recentInvs.length})`);
    for (const i of recentInvs.slice(0, 20)) {
      lines.push(
        `- ${i.title}: ${i.total_cents} cents [status=${i.status}, paid=${i.paid_cents}]`,
      );
    }
  }
  lines.push('');

  const activeDeals = data.active_deals ?? [];
  if (activeDeals.length === 0) {
    lines.push('## Active deals\n- (none)');
  } else {
    lines.push(`## Active deals (${activeDeals.length})`);
    for (const d of activeDeals.slice(0, 15)) {
      lines.push(
        `- ${d.title} [stage=${d.stage}, value=${d.value_cents ?? 'unset'} cents, close=${d.expected_close_date ?? 'unset'}]`,
      );
    }
  }

  if (data.scoped_deal) {
    lines.push('');
    lines.push('## Scoped deal');
    lines.push(`- Title: ${data.scoped_deal.title}`);
    lines.push(`- Stage: ${data.scoped_deal.stage}`);
    lines.push(`- Value: ${data.scoped_deal.value_cents ?? 'unset'} cents`);
    lines.push(`- Expected close: ${data.scoped_deal.expected_close_date ?? 'unset'}`);
    if (data.scoped_contact) {
      lines.push(`- Contact: ${data.scoped_contact.first_name} ${data.scoped_contact.last_name}`);
    }
  }

  return lines.join('\n');
}

function renderSales(data: any): string {
  const lines: string[] = [];
  lines.push('## Sales context');

  const pd = data.pipeline_distribution ?? {};
  if (Object.keys(pd).length === 0) {
    lines.push('- Pipeline: (empty)');
  } else {
    lines.push('- Pipeline distribution:');
    for (const [stage, count] of Object.entries(pd)) {
      lines.push(`  - ${stage}: ${count as number}`);
    }
  }
  lines.push('');

  const openDeals = data.open_deals ?? [];
  if (openDeals.length === 0) {
    lines.push('## Open deals\n- (none)');
  } else {
    lines.push(`## Open deals (${openDeals.length})`);
    for (const d of openDeals.slice(0, 25)) {
      lines.push(
        `- ${d.title} [stage=${d.stage}, value=${d.value_cents ?? 'unset'} cents, close=${d.expected_close_date ?? 'unset'}]`,
      );
    }
  }
  lines.push('');

  const ri = data.recent_interactions ?? {};
  const dealIds = Object.keys(ri);
  if (dealIds.length === 0) {
    lines.push('## Recent interactions\n- (none)');
  } else {
    lines.push(`## Recent interactions (for ${dealIds.length} deals)`);
    for (const [dealId, interactions] of Object.entries(ri)) {
      const ixList = interactions as any[];
      for (const ix of ixList.slice(0, 3)) {
        lines.push(
          `- Deal ${dealId.slice(0, 8)}: ${ix.interaction_type} — "${(ix.summary ?? '').slice(0, 80)}"`,
        );
      }
    }
  }

  if (data.scoped_deal) {
    lines.push('');
    lines.push('## Scoped deal');
    lines.push(`- Title: ${data.scoped_deal.title}`);
    lines.push(`- Stage: ${data.scoped_deal.stage}`);
    lines.push(`- Value: ${data.scoped_deal.value_cents ?? 'unset'} cents`);
    if (data.scoped_contact) {
      lines.push(`- Contact: ${data.scoped_contact.first_name} ${data.scoped_contact.last_name}`);
    }
    const scopedIxs = data.scoped_interactions ?? [];
    if (scopedIxs.length > 0) {
      lines.push('- Recent interactions:');
      for (const ix of scopedIxs.slice(0, 10)) {
        lines.push(
          `  - ${ix.interaction_type} (${ix.occurred_at.slice(0, 10)}): "${(ix.summary ?? '').slice(0, 100)}"`,
        );
      }
    }
  }

  return lines.join('\n');
}

function renderMarketing(data: any): string {
  const lines: string[] = [];
  lines.push('## Marketing context');

  const sd = data.source_distribution ?? [];
  if (sd.length === 0) {
    lines.push('- Source distribution: (no data)');
  } else {
    lines.push(`- Source distribution (${sd.length} sources):`);
    for (const s of sd) {
      lines.push(
        `  - ${s.source}: ${s.deal_count} deals, ${s.won_count} won (${s.won_rate}% win rate)`,
      );
    }
  }
  lines.push('');

  const won = data.recent_won_deals ?? [];
  if (won.length === 0) {
    lines.push('## Recent won deals\n- (none)');
  } else {
    lines.push(`## Recent won deals (${won.length})`);
    for (const d of won.slice(0, 10)) {
      lines.push(`- ${d.title} [value=${d.value_cents ?? 'unset'} cents, source=${d.source ?? 'unknown'}]`);
    }
  }
  lines.push('');

  const st = data.service_tags ?? {};
  if (Object.keys(st).length > 0) {
    lines.push('## Service tags');
    for (const [tag, count] of Object.entries(st)) {
      lines.push(`- ${tag}: ${count as number}`);
    }
    lines.push('');
  }

  const ct = data.contact_tiers ?? {};
  if (Object.keys(ct).length > 0) {
    lines.push('## Contact tiers');
    for (const [tier, count] of Object.entries(ct)) {
      lines.push(`- ${tier}: ${count as number}`);
    }
    lines.push('');
  }

  lines.push(`- Interaction velocity (90d): ${data.interaction_velocity_90d ?? 0}`);

  if (data.scoped_deal) {
    lines.push('');
    lines.push('## Scoped deal');
    lines.push(`- Source: ${data.scoped_deal.source ?? 'unknown'}`);
    if (data.scoped_contact) {
      lines.push(`- Contact: ${data.scoped_contact.first_name} ${data.scoped_contact.last_name}`);
    }
    const si = data.scoped_invoices ?? [];
    if (si.length > 0) {
      lines.push('- Invoices:');
      for (const inv of si.slice(0, 5)) {
        lines.push(`  - ${inv.title}: ${inv.total_cents} cents [status=${inv.status}]`);
      }
    }
  }

  return lines.join('\n');
}

function renderStrategy(data: any): string {
  const lines: string[] = [];
  lines.push('## Strategy context');

  const mr = data.monthly_revenue_6mo ?? [];
  lines.push('- Monthly revenue (6mo):');
  for (const m of mr) {
    lines.push(`  - ${m.month}: ${m.revenue_cents} cents`);
  }

  const me = data.monthly_expenses_6mo ?? [];
  lines.push('- Monthly expenses (6mo):');
  for (const m of me) {
    lines.push(`  - ${m.month}: ${m.expense_cents} cents`);
  }

  const gm = data.gross_margin ?? {};
  lines.push(`- Gross margin: ${gm.margin_cents ?? 0} cents (${gm.margin_pct ?? 0}%)`);
  lines.push(`  - Revenue: ${gm.total_revenue_cents ?? 0} cents`);
  lines.push(`  - Expenses: ${gm.total_expense_cents ?? 0} cents`);
  lines.push(`- Active clients: ${data.active_client_count ?? 0}`);

  const tr = data.top_clients_by_revenue ?? [];
  if (tr.length > 0) {
    lines.push('- Top clients by revenue:');
    for (const c of tr) {
      lines.push(`  - ${c.name}: ${c.revenue_cents} cents`);
    }
  }

  const tt = data.top_clients_by_time ?? [];
  if (tt.length > 0) {
    lines.push('- Top clients by time:');
    for (const c of tt) {
      lines.push(`  - ${c.name}: ${c.total_minutes} minutes`);
    }
  }

  if (data.scoped_project) {
    lines.push('');
    lines.push('## Scoped project');
    const sp = data.scoped_project;
    lines.push(`- Title: ${sp.title}`);
    lines.push(`- Billable minutes: ${sp.billable_minutes}`);
    lines.push(`- Non-billable minutes: ${sp.non_billable_minutes}`);
    lines.push(`- Budget: ${sp.budget_cents ?? 'unset'} cents`);
    lines.push(`- Spent: ${sp.spent_cents} cents`);
    if (sp.budget_cents != null) {
      const pct = sp.budget_cents > 0 ? Math.round((sp.spent_cents / sp.budget_cents) * 100) : 0;
      lines.push(`- Budget used: ${pct}%`);
    }
  }

  return lines.join('\n');
}

function renderGeneral(data: any): string {
  const lines: string[] = [];
  lines.push('## Business snapshot');
  lines.push(`- Contacts: ${data.contact_count ?? 0}`);
  lines.push(`- Active projects: ${data.active_project_count ?? 0}`);
  lines.push(`- Open invoices: ${data.open_invoice_count ?? 0}`);
  lines.push(`- Outstanding: ${data.outstanding_cents ?? 0} cents`);
  lines.push(`- Monthly expenses (this month): ${data.monthly_expense_total_cents ?? 0} cents`);

  const dc = data.deal_counts_by_stage ?? {};
  if (Object.keys(dc).length > 0) {
    lines.push('- Deals by stage:');
    for (const [stage, count] of Object.entries(dc)) {
      lines.push(`  - ${stage}: ${count as number}`);
    }
  }

  return lines.join('\n');
}

function renderContext(ctx: BusinessCoachContext): string {
  switch (ctx.mode) {
    case 'pricing_advisor':
      return renderPricing(ctx.data);
    case 'sales_coach':
      return renderSales(ctx.data);
    case 'marketing_advisor':
      return renderMarketing(ctx.data);
    case 'business_strategist':
      return renderStrategy(ctx.data);
    case 'general':
      return renderGeneral(ctx.data);
  }
}

export function buildSystemPrompt(
  ctx: BusinessCoachContext,
  mode: CoachMode,
): string {
  return [
    'You are the Pantheon Business Coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ].join('\n');
}
