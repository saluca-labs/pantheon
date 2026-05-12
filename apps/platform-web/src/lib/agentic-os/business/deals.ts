/**
 * Business OS Phase 2 — deal domain types + pure helpers.
 *
 * DB calls live in `deals-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import { normalizeTags } from './crm';

// ─── Constants ────────────────────────────────────────────────────────────

export const DEAL_STAGES = [
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'on_hold',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Deal {
  id: string;
  userId: string;
  contactId: string | null;
  organizationId: string | null;
  title: string;
  descriptionMd: string;
  stage: DealStage;
  valueCents: number | null;
  currency: string;
  probabilityPct: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
  lostReason: string | null;
  source: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateDealInput {
  title: string;
  contactId?: string | null;
  organizationId?: string | null;
  descriptionMd?: string;
  stage?: DealStage;
  valueCents?: number | null;
  currency?: string;
  probabilityPct?: number;
  expectedCloseDate?: string | null;
  source?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateDealInput = Partial<{
  title: string;
  contactId: string | null;
  organizationId: string | null;
  descriptionMd: string;
  stage: DealStage;
  valueCents: number | null;
  currency: string;
  probabilityPct: number;
  expectedCloseDate: string | null;
  lostReason: string | null;
  source: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── Stage transition input ───────────────────────────────────────────────

export interface StageTransitionInput {
  stage: DealStage;
  lostReason?: string | null;
}

// ─── List filter ──────────────────────────────────────────────────────────

export interface DealsListOpts {
  archived?: boolean;
  stage?: DealStage | DealStage[];
  contactId?: string;
  organizationId?: string;
  source?: string;
  tag?: string;
  open?: boolean;
  includeForecast?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Forecast ─────────────────────────────────────────────────────────────

export interface DealWithForecast extends Deal {
  weightedValueCents: number | null;
}

export interface PipelineForecast {
  totalValueCents: number;
  totalWeightedValueCents: number;
  dealCount: number;
}

export function computeWeightedValue(
  valueCents: number | null,
  probabilityPct: number,
): number | null {
  if (valueCents == null) return null;
  return Math.round(valueCents * probabilityPct / 100);
}

export function computePipelineForecast(deals: Deal[]): PipelineForecast {
  const openDeals = deals.filter(
    (d) => d.archivedAt == null && d.stage !== 'won' && d.stage !== 'lost',
  );
  let totalValue = 0;
  let totalWeighted = 0;
  for (const d of openDeals) {
    if (d.valueCents != null) {
      totalValue += d.valueCents;
      totalWeighted += computeWeightedValue(d.valueCents, d.probabilityPct) ?? 0;
    }
  }
  return {
    totalValueCents: totalValue,
    totalWeightedValueCents: totalWeighted,
    dealCount: openDeals.length,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidDealStage(value: unknown): value is DealStage {
  return typeof value === 'string' && (DEAL_STAGES as readonly string[]).includes(value);
}

export function validateDealTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 200) return 'too long (max 200 chars)';
  return null;
}

export function validateProbabilityPct(value: unknown): string | null {
  if (typeof value !== 'number') return 'must be a number';
  if (!Number.isInteger(value)) return 'must be an integer';
  if (value < 0 || value > 100) return 'must be between 0 and 100';
  return null;
}
