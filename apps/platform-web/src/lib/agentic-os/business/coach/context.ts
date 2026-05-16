/**
 * Business OS coach — per-mode context snapshot.
 *
 * Loads a compact, current-state view for one session. The shape varies
 * by mode so the model isn't given a full business dump every turn:
 *
 *   - pricing_advisor: recent invoices + active deals + pricing rollup.
 *     If deal-scoped: deal history + contact.
 *   - sales_coach: open deals + recent interactions per deal + pipeline
 *     stage distribution. If deal-scoped: full deal + contact + interactions.
 *   - marketing_advisor: deal-source distribution (12mo) + recent won deals
 *     + service-tag distribution + contact tier distribution + interaction
 *     velocity (90d). If deal-scoped: deal source + contact + invoices.
 *   - business_strategist: monthly revenue/expenses 6mo + gross margin +
 *     active client count + top 3 clients. If project-scoped: billable vs
 *     non-billable hours + budget vs spent.
 *   - general: contact count + deal count by stage + active project count +
 *     open invoice count + outstanding + monthly expense total.
 *
 * The size cap (`MAX_CONTEXT_BYTES`) is enforced after rendering to JSON
 * so a pathological notes payload can't blow the model's context window.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import 'server-only';
import { listInvoices } from '../invoices-repo';
import { listDeals, getDeal } from '../deals-repo';
import { listExpenses } from '../expenses-repo';
import { listProjects, getProject } from '../projects-repo';
import { listTimeEntries } from '../time-entries-repo';
import { listPeople, getPerson } from '../people-repo';
import { listInteractions } from '../interactions-repo';
import type { Deal } from '../deals';
import type { Invoice } from '../invoices';
import type { Person } from '../people';
import type { Interaction } from '../interactions';
import type { CoachMode } from './modes';

/** Hard cap on the rendered JSON size (50 KB pre-prompt). Truncate beyond. */
export const MAX_CONTEXT_BYTES = 50_000;

// ─── Shared types ──────────────────────────────────────────────────────────

export interface CoachDealSummary {
  id: string;
  title: string;
  stage: string;
  value_cents: number | null;
  currency: string;
  expected_close_date: string | null;
  source: string | null;
  created_at: string;
}

export interface CoachInvoiceSummary {
  id: string;
  title: string;
  total_cents: number;
  paid_cents: number;
  status: string;
  due_on: string | null;
  invoice_date: string | null;
}

export interface CoachContactSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string | null;
  organization: string | null;
}

export interface CoachInteractionSummary {
  id: string;
  deal_id: string | null;
  interaction_type: string;
  summary: string;
  occurred_at: string;
}

// ─── Mode-specific context types ───────────────────────────────────────────

export interface CoachPricingContext {
  recent_invoices: CoachInvoiceSummary[];
  active_deals: CoachDealSummary[];
  pricing_history: {
    avg_deal_value_cents: number;
    avg_hourly_invoice_cents: number;
    avg_fixed_invoice_cents: number;
    deal_count_last_6mo: number;
    total_revenue_last_6mo_cents: number;
  };
  scoped_deal: CoachDealSummary | null;
  scoped_contact: CoachContactSummary | null;
}

export interface CoachSalesContext {
  open_deals: CoachDealSummary[];
  recent_interactions: Record<string, CoachInteractionSummary[]>;
  pipeline_distribution: Record<string, number>;
  scoped_deal: CoachDealSummary | null;
  scoped_contact: CoachContactSummary | null;
  scoped_interactions: CoachInteractionSummary[];
}

export interface CoachMarketingContext {
  source_distribution: Array<{
    source: string;
    deal_count: number;
    won_count: number;
    won_rate: number;
  }>;
  recent_won_deals: CoachDealSummary[];
  service_tags: Record<string, number>;
  contact_tiers: Record<string, number>;
  interaction_velocity_90d: number;
  scoped_deal: CoachDealSummary | null;
  scoped_contact: CoachContactSummary | null;
  scoped_invoices: CoachInvoiceSummary[];
}

export interface CoachStrategyContext {
  monthly_revenue_6mo: Array<{ month: string; revenue_cents: number }>;
  monthly_expenses_6mo: Array<{ month: string; expense_cents: number }>;
  gross_margin: {
    total_revenue_cents: number;
    total_expense_cents: number;
    margin_cents: number;
    margin_pct: number;
  };
  active_client_count: number;
  top_clients_by_revenue: Array<{ name: string; revenue_cents: number }>;
  top_clients_by_time: Array<{ name: string; total_minutes: number }>;
  scoped_project: {
    id: string;
    title: string;
    billable_minutes: number;
    non_billable_minutes: number;
    budget_cents: number | null;
    spent_cents: number;
  } | null;
}

export interface CoachGeneralContext {
  contact_count: number;
  deal_counts_by_stage: Record<string, number>;
  active_project_count: number;
  open_invoice_count: number;
  outstanding_cents: number;
  monthly_expense_total_cents: number;
}

export type BusinessCoachContext =
  | { mode: 'pricing_advisor'; data: CoachPricingContext }
  | { mode: 'sales_coach'; data: CoachSalesContext }
  | { mode: 'marketing_advisor'; data: CoachMarketingContext }
  | { mode: 'business_strategist'; data: CoachStrategyContext }
  | { mode: 'general'; data: CoachGeneralContext };

export interface BuildCoachContextInput {
  userId: string;
  mode: CoachMode;
  projectId?: string | null;
  dealId?: string | null;
}

// ─── Truncation helpers ────────────────────────────────────────────────────

export function enforceContextSizeCap(payload: unknown): unknown {
  const initial = JSON.stringify(payload);
  if (initial.length <= MAX_CONTEXT_BYTES) return payload;

  const clone = JSON.parse(initial);
  const containers = collectArrayContainers(clone);
  containers.sort((a, b) => b.array.length - a.array.length);
  for (const container of containers) {
    while (
      container.array.length > 0 &&
      JSON.stringify(clone).length > MAX_CONTEXT_BYTES
    ) {
      container.array.pop();
      container.truncated = true;
    }
    if (container.truncated) {
      container.parent[container.key] = {
        _truncated: true,
        _kept: container.array.length,
        items: container.array,
      };
    }
    if (JSON.stringify(clone).length <= MAX_CONTEXT_BYTES) break;
  }
  return clone;
}

interface ArrayContainer {
  parent: Record<string, unknown>;
  key: string;
  array: unknown[];
  truncated: boolean;
}

function collectArrayContainers(node: unknown, into: ArrayContainer[] = []): ArrayContainer[] {
  if (node == null || typeof node !== 'object') return into;
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      into.push({ parent: obj, key, array: value, truncated: false });
    } else if (value && typeof value === 'object') {
      collectArrayContainers(value, into);
    }
  }
  return into;
}

// ─── Pure mapping helpers ─────────────────────────────────────────────────

function mapDeal(d: Deal): CoachDealSummary {
  return {
    id: d.id,
    title: d.title,
    stage: d.stage,
    value_cents: d.valueCents ?? null,
    currency: d.currency ?? 'USD',
    expected_close_date: d.expectedCloseDate ?? null,
    source: d.source ?? null,
    created_at: d.createdAt,
  };
}

function mapInvoice(i: Invoice): CoachInvoiceSummary {
  return {
    id: i.id,
    title: i.title,
    total_cents: i.totalCents,
    paid_cents: i.paidCents,
    status: i.status,
    due_on: i.dueOn ?? null,
    invoice_date: i.invoiceDate ?? null,
  };
}

function mapContactFromPerson(p: Person): CoachContactSummary {
  return {
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email ?? null,
    role: p.role ?? null,
    organization: null,
  };
}

function mapInteraction(i: Interaction): CoachInteractionSummary {
  return {
    id: i.id,
    deal_id: i.dealId ?? null,
    interaction_type: i.interactionType,
    summary: i.summary,
    occurred_at: i.occurredAt,
  };
}

// ─── Pricing advisor loader ────────────────────────────────────────────────

async function loadPricing(
  userId: string,
  dealId: string | null,
): Promise<CoachPricingContext> {
  const [invoices, deals] = await Promise.all([
    listInvoices(userId, { limit: 30 }),
    listDeals(userId, { open: true, limit: 100 }),
  ]);

  const recentInvoices = invoices.slice(0, 30).map(mapInvoice);
  const activeDeals = deals.slice(0, 50).map(mapDeal);

  // Pricing history rollup from invoices (last 6 months)
  const sixMoAgo = new Date();
  sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);
  const sixMoCutoff = sixMoAgo.toISOString().slice(0, 10);
  const recentDeals = await listDeals(userId, { limit: 500 });
  const deals6mo = recentDeals.filter((d) => d.createdAt >= sixMoCutoff && d.stage === 'won');
  const totalDealValue6mo = deals6mo.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
  const invoices6mo = invoices.filter((i) => (i.invoiceDate ?? '') >= sixMoCutoff);
  const totalInvRevenue6mo = invoices6mo.reduce((sum, i) => sum + i.totalCents, 0);
  const hourlyInvs = invoices6mo.filter((i) => i.status !== 'draft');
  const fixedInvs = invoices6mo.filter((i) => i.status !== 'draft');

  // Scoped deal + contact
  let scopedDeal: CoachDealSummary | null = null;
  let scopedContact: CoachContactSummary | null = null;
  if (dealId) {
    const deal = await getDeal(dealId, userId);
    if (deal) {
      scopedDeal = mapDeal(deal);
      if (deal.contactId) {
        const person = await getPerson(deal.contactId, userId);
        if (person) scopedContact = mapContactFromPerson(person);
      }
    }
  }

  return {
    recent_invoices: recentInvoices,
    active_deals: activeDeals,
    pricing_history: {
      avg_deal_value_cents: deals6mo.length > 0 ? Math.round(totalDealValue6mo / deals6mo.length) : 0,
      avg_hourly_invoice_cents: hourlyInvs.length > 0 ? Math.round(totalInvRevenue6mo / hourlyInvs.length) : 0,
      avg_fixed_invoice_cents: fixedInvs.length > 0 ? Math.round(totalInvRevenue6mo / fixedInvs.length) : 0,
      deal_count_last_6mo: deals6mo.length,
      total_revenue_last_6mo_cents: totalInvRevenue6mo,
    },
    scoped_deal: scopedDeal,
    scoped_contact: scopedContact,
  };
}

// ─── Sales coach loader ────────────────────────────────────────────────────

async function loadSales(
  userId: string,
  dealId: string | null,
): Promise<CoachSalesContext> {
  const [allDeals, allInteractions] = await Promise.all([
    listDeals(userId, { limit: 500 }),
    listInteractions(userId, { limit: 500 }),
  ]);

  const openDeals = allDeals
    .filter((d) => d.stage !== 'won' && d.stage !== 'lost' && d.archivedAt == null)
    .slice(0, 50)
    .map(mapDeal);

  // Recent interactions grouped by deal (last 5 per deal)
  const recentInteractions: Record<string, CoachInteractionSummary[]> = {};
  for (const ix of allInteractions) {
    if (!ix.dealId) continue;
    if (!recentInteractions[ix.dealId]) recentInteractions[ix.dealId] = [];
    if (recentInteractions[ix.dealId].length < 5) {
      recentInteractions[ix.dealId].push(mapInteraction(ix));
    }
  }

  // Pipeline stage distribution
  const pipelineDistribution: Record<string, number> = {};
  for (const d of allDeals) {
    if (d.archivedAt != null) continue;
    pipelineDistribution[d.stage] = (pipelineDistribution[d.stage] ?? 0) + 1;
  }

  // Scoped deal + contact + interactions
  let scopedDeal: CoachDealSummary | null = null;
  let scopedContact: CoachContactSummary | null = null;
  let scopedInteractions: CoachInteractionSummary[] = [];
  if (dealId) {
    const deal = await getDeal(dealId, userId);
    if (deal) {
      scopedDeal = mapDeal(deal);
      if (deal.contactId) {
        const person = await getPerson(deal.contactId, userId);
        if (person) scopedContact = mapContactFromPerson(person);
      }
      scopedInteractions = allInteractions
        .filter((i) => i.dealId === dealId)
        .slice(0, 20)
        .map(mapInteraction);
    }
  }

  return {
    open_deals: openDeals,
    recent_interactions: recentInteractions,
    pipeline_distribution: pipelineDistribution,
    scoped_deal: scopedDeal,
    scoped_contact: scopedContact,
    scoped_interactions: scopedInteractions,
  };
}

// ─── Marketing advisor loader ──────────────────────────────────────────────

async function loadMarketing(
  userId: string,
  dealId: string | null,
): Promise<CoachMarketingContext> {
  const twelveMoAgo = new Date();
  twelveMoAgo.setFullYear(twelveMoAgo.getFullYear() - 1);
  const twelveMoCutoff = twelveMoAgo.toISOString().slice(0, 10);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDayCutoff = ninetyDaysAgo.toISOString();

  const [allDeals, contacts, invoices, allInteractions] = await Promise.all([
    listDeals(userId, { limit: 500 }),
    listPeople(userId, { limit: 500 }),
    listInvoices(userId, { limit: 200 }),
    listInteractions(userId, { from: ninetyDayCutoff, limit: 500 }),
  ]);

  // Source distribution (12 months)
  const deals12mo = allDeals.filter((d) => d.createdAt >= twelveMoCutoff);
  const sourceMap: Record<string, { count: number; won: number }> = {};
  for (const d of deals12mo) {
    const src = d.source ?? 'unknown';
    if (!sourceMap[src]) sourceMap[src] = { count: 0, won: 0 };
    sourceMap[src].count += 1;
    if (d.stage === 'won') sourceMap[src].won += 1;
  }
  const sourceDistribution = Object.entries(sourceMap).map(([source, v]) => ({
    source,
    deal_count: v.count,
    won_count: v.won,
    won_rate: v.count > 0 ? Math.round((v.won / v.count) * 100) : 0,
  }));

  // Recent won deals
  const recentWonDeals = deals12mo
    .filter((d) => d.stage === 'won')
    .slice(0, 20)
    .map(mapDeal);

  // Service tags from invoices (aggregate metadata tags)
  const serviceTags: Record<string, number> = {};
  for (const i of invoices) {
    const tags = (i.metadata?.service_tags as string[]) ?? [];
    for (const t of tags) {
      serviceTags[t] = (serviceTags[t] ?? 0) + 1;
    }
  }

  // Contact tier distribution (from person tags)
  const contactTiers: Record<string, number> = {};
  for (const p of contacts) {
    const tierTags = (p.tags ?? []).filter((t: string) =>
      t.startsWith('tier:') || t.startsWith('vip') || t === 'client' || t === 'prospect' || t === 'lead',
    );
    for (const t of tierTags) {
      contactTiers[t] = (contactTiers[t] ?? 0) + 1;
    }
  }
  if (Object.keys(contactTiers).length === 0) {
    contactTiers['client'] = contacts.filter((c) => c.stage === 'client').length;
    contactTiers['lead'] = contacts.filter((c) => c.stage === 'lead').length;
    contactTiers['prospect'] = contacts.filter((c) => c.stage === 'prospect').length;
  }

  // Interaction velocity (90 days)
  const interactionVelocity90d = allInteractions.length;

  // Scoped deal + contact + invoices
  let scopedDeal: CoachDealSummary | null = null;
  let scopedContact: CoachContactSummary | null = null;
  let scopedInvoices: CoachInvoiceSummary[] = [];
  if (dealId) {
    const deal = await getDeal(dealId, userId);
    if (deal) {
      scopedDeal = mapDeal(deal);
      if (deal.contactId) {
        const person = await getPerson(deal.contactId, userId);
        if (person) scopedContact = mapContactFromPerson(person);
      }
      scopedInvoices = invoices
        .filter((i) => i.dealId === dealId)
        .slice(0, 10)
        .map(mapInvoice);
    }
  }

  return {
    source_distribution: sourceDistribution,
    recent_won_deals: recentWonDeals,
    service_tags: serviceTags,
    contact_tiers: contactTiers,
    interaction_velocity_90d: interactionVelocity90d,
    scoped_deal: scopedDeal,
    scoped_contact: scopedContact,
    scoped_invoices: scopedInvoices,
  };
}

// ─── Business strategist loader ────────────────────────────────────────────

async function loadStrategy(
  userId: string,
  projectId: string | null,
): Promise<CoachStrategyContext> {
  const sixMoAgo = new Date();
  sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);
  const sixMoCutoff = sixMoAgo.toISOString().slice(0, 10);

  const [invoices, expenses, projects, deals] = await Promise.all([
    listInvoices(userId, { limit: 500 }),
    listExpenses(userId, { from: sixMoCutoff, limit: 500 }),
    listProjects(userId, { limit: 200 }),
    listDeals(userId, { limit: 500 }),
  ]);

  // Monthly revenue for last 6 months
  const monthlyRevenue: Record<string, number> = {};
  for (const i of invoices) {
    const month = (i.invoiceDate ?? '').slice(0, 7);
    if (!month || month < sixMoCutoff.slice(0, 7)) continue;
    monthlyRevenue[month] = (monthlyRevenue[month] ?? 0) + i.totalCents;
  }
  const months = generateLastNMonths(6);
  const monthlyRevenue6mo = months.map((m) => ({
    month: m,
    revenue_cents: monthlyRevenue[m] ?? 0,
  }));

  // Monthly expenses for last 6 months
  const monthlyExpenses: Record<string, number> = {};
  for (const e of expenses) {
    const month = (e.incurredOn ?? '').slice(0, 7);
    if (!month) continue;
    monthlyExpenses[month] = (monthlyExpenses[month] ?? 0) + e.amountCents;
  }
  const monthlyExpenses6mo = months.map((m) => ({
    month: m,
    expense_cents: monthlyExpenses[m] ?? 0,
  }));

  const totalRev = Object.values(monthlyRevenue).reduce((a, b) => a + b, 0);
  const totalExp = Object.values(monthlyExpenses).reduce((a, b) => a + b, 0);

  // Active clients
  const activeClientSet = new Set<string>();
  for (const d of deals) {
    if (d.archivedAt == null && d.stage !== 'lost' && d.contactId) {
      activeClientSet.add(d.contactId);
    }
  }

  // Top 3 clients by revenue
  const clientRevenue: Record<string, number> = {};
  for (const i of invoices) {
    const key = i.contactId ?? 'unknown';
    clientRevenue[key] = (clientRevenue[key] ?? 0) + i.totalCents;
  }
  const topByRevenue = Object.entries(clientRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, rev]) => ({ name: id === 'unknown' ? 'Unknown' : id.slice(0, 8), revenue_cents: rev }));

  // Top 3 clients by time (from time entries)
  let topByTime: Array<{ name: string; total_minutes: number }> = [];
  try {
    const allTimeEntries = await listTimeEntries(userId, { limit: 500 });
    const clientMinutes: Record<string, number> = {};
    for (const te of allTimeEntries) {
      const key = te.projectId;
      clientMinutes[key] = (clientMinutes[key] ?? 0) + (te.durationMinutes ?? 0);
    }
    topByTime = Object.entries(clientMinutes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, min]) => ({ name: id.slice(0, 8), total_minutes: Math.round(min) }));
  } catch {
    // time entries may not exist yet
  }

  // Scoped project
  let scopedProject: CoachStrategyContext['scoped_project'] = null;
  if (projectId) {
    const project = await getProject(projectId, userId);
    if (project) {
      const entries = await listTimeEntries(userId, { projectId, limit: 500 });
      const billable = entries
        .filter((e) => e.isBillable)
        .reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
      const nonBillable = entries
        .filter((e) => !e.isBillable)
        .reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
      const rate = project.defaultRateCents ?? 0;
      const spentCents = Math.round(billable * (rate / 60));
      scopedProject = {
        id: project.id,
        title: project.title,
        billable_minutes: Math.round(billable),
        non_billable_minutes: Math.round(nonBillable),
        budget_cents: project.budgetCents,
        spent_cents: spentCents,
      };
    }
  }

  return {
    monthly_revenue_6mo: monthlyRevenue6mo,
    monthly_expenses_6mo: monthlyExpenses6mo,
    gross_margin: {
      total_revenue_cents: totalRev,
      total_expense_cents: totalExp,
      margin_cents: totalRev - totalExp,
      margin_pct: totalRev > 0 ? Math.round(((totalRev - totalExp) / totalRev) * 100) : 0,
    },
    active_client_count: activeClientSet.size,
    top_clients_by_revenue: topByRevenue,
    top_clients_by_time: topByTime,
    scoped_project: scopedProject,
  };
}

// ─── General loader ────────────────────────────────────────────────────────

async function loadGeneral(userId: string): Promise<CoachGeneralContext> {
  const [contacts, deals, projects, invoices, expenses] = await Promise.all([
    listPeople(userId, { limit: 500 }),
    listDeals(userId, { limit: 500 }),
    listProjects(userId, { limit: 200 }),
    listInvoices(userId, { limit: 200 }),
    listExpenses(userId, { limit: 200 }),
  ]);

  const dealCountsByStage: Record<string, number> = {};
  for (const d of deals) {
    if (d.archivedAt != null) continue;
    dealCountsByStage[d.stage] = (dealCountsByStage[d.stage] ?? 0) + 1;
  }

  const openInvoices = invoices.filter((i) =>
    ['sent', 'partial', 'overdue'].includes(i.status),
  );
  const outstandingCents = openInvoices.reduce(
    (sum, i) => sum + (i.totalCents - i.paidCents),
    0,
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyExpenseTotal = expenses
    .filter((e) => (e.incurredOn ?? '').startsWith(currentMonth))
    .reduce((sum, e) => sum + e.amountCents, 0);

  return {
    contact_count: contacts.length,
    deal_counts_by_stage: dealCountsByStage,
    active_project_count: projects.filter((p) => p.status === 'active').length,
    open_invoice_count: openInvoices.length,
    outstanding_cents: outstandingCents,
    monthly_expense_total_cents: monthlyExpenseTotal,
  };
}

// ─── Utils ─────────────────────────────────────────────────────────────────

function generateLastNMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(d.toISOString().slice(0, 7));
  }
  return result;
}

// ─── Main orchestrator ─────────────────────────────────────────────────────

export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<BusinessCoachContext> {
  switch (input.mode) {
    case 'pricing_advisor': {
      const data = await loadPricing(input.userId, input.dealId ?? null);
      return {
        mode: 'pricing_advisor',
        data: enforceContextSizeCap(data) as CoachPricingContext,
      };
    }
    case 'sales_coach': {
      const data = await loadSales(input.userId, input.dealId ?? null);
      return {
        mode: 'sales_coach',
        data: enforceContextSizeCap(data) as CoachSalesContext,
      };
    }
    case 'marketing_advisor': {
      const data = await loadMarketing(input.userId, input.dealId ?? null);
      return {
        mode: 'marketing_advisor',
        data: enforceContextSizeCap(data) as CoachMarketingContext,
      };
    }
    case 'business_strategist': {
      const data = await loadStrategy(input.userId, input.projectId ?? null);
      return {
        mode: 'business_strategist',
        data: enforceContextSizeCap(data) as CoachStrategyContext,
      };
    }
    case 'general': {
      const data = await loadGeneral(input.userId);
      return {
        mode: 'general',
        data: enforceContextSizeCap(data) as CoachGeneralContext,
      };
    }
  }
}
