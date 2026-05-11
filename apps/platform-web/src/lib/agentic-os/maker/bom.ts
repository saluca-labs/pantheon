/**
 * Maker OS — Bill of Materials domain types and pure helpers.
 *
 * A BOM line attaches a catalog row to a project with a needed quantity and
 * priority. Variants are optional. The summary computation joins catalog +
 * variant + cheapest supplier link to produce the per-line view rendered by
 * the BOM editor:
 *
 *     needed   – BOM line quantity_needed
 *     on_hand  – catalog (or variant) quantity_on_hand
 *     free     – on_hand minus demand from OTHER active projects' BOM lines
 *     deficit  – max(0, needed - free)
 *     est_cost – needed * cheapest unit_price_cents (null when no quote)
 *
 * Active projects are those whose status is NOT in ('done','archived').
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import type { PartCatalogRow, PartVariant } from './catalog';
import type { PartSupplierLink } from './suppliers';
import type { ProjectStatus } from './projects';

// ─── Priority ─────────────────────────────────────────────────────────────

export const BOM_PRIORITY_VALUES = ['low', 'normal', 'critical'] as const;

export type BomPriority = (typeof BOM_PRIORITY_VALUES)[number];

export const BOM_PRIORITY_LABELS: Record<BomPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  critical: 'Critical',
};

// ─── BOM line ─────────────────────────────────────────────────────────────

export interface BomLine {
  id: string;
  projectId: string;
  partCatalogId: string;
  variantId: string | null;
  quantityNeeded: number;
  notes: string | null;
  priority: BomPriority;
  createdAt: string;
  updatedAt: string;
}

export interface BomLineUpsert {
  partCatalogId: string;
  variantId?: string | null;
  quantityNeeded: number;
  notes?: string | null;
  priority?: BomPriority;
}

export type BomLinePatch = Partial<Omit<BomLineUpsert, 'partCatalogId'>>;

// ─── Active project set ───────────────────────────────────────────────────

/**
 * Project statuses considered "active" for the purpose of free-quantity
 * computation. Done + archived projects do not consume catalog stock —
 * their BOM lines record historical demand only.
 */
export const ACTIVE_PROJECT_STATUSES: ReadonlyArray<ProjectStatus> = [
  'concept',
  'design',
  'procurement',
  'fabrication',
  'assembly',
  'commissioning',
];

export function isActiveStatus(status: ProjectStatus): boolean {
  return (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(status);
}

// ─── BOM summary ──────────────────────────────────────────────────────────

export interface BomSummaryRow {
  line: BomLine;
  catalog: PartCatalogRow;
  variant: PartVariant | null;
  needed: number;
  onHand: number;
  /** Free = on_hand - demand_from_other_active_projects (clamped at 0). */
  free: number;
  /** Deficit = max(0, needed - free). */
  deficit: number;
  /** Estimated cost (cents) = needed * cheapest unit_price_cents (or null). */
  estCostCents: number | null;
  currency: string;
  /** Cheapest supplier link used for the est_cost. */
  cheapestLinkId: string | null;
}

export interface BomSummary {
  projectId: string;
  rows: BomSummaryRow[];
  totalEstCostCents: number;
  currency: string;
  totalDeficit: number;
  linesCount: number;
  criticalDeficitLines: number;
}

// ─── Pure summary computation ─────────────────────────────────────────────

/**
 * Input for the pure summary calculator. The repo loads the joined records
 * and passes them in; this fn does no I/O so it's trivially unit-testable.
 */
export interface ComputeBomSummaryArgs {
  projectId: string;
  /** BOM lines for the target project. */
  projectLines: BomLine[];
  /**
   * Demand-by-catalog-and-variant from OTHER active projects only. The repo
   * pre-aggregates this so the helper never sees a project's own lines twice.
   * Keys are `${partCatalogId}:${variantId ?? 'NULL'}`.
   */
  otherDemand: Map<string, number>;
  catalogById: Map<string, PartCatalogRow>;
  variantById: Map<string, PartVariant>;
  /** All supplier links for catalog rows touched by `projectLines`. */
  linksByCatalog: Map<string, PartSupplierLink[]>;
}

export function computeBomSummary(args: ComputeBomSummaryArgs): BomSummary {
  const rows: BomSummaryRow[] = [];
  let totalEstCostCents = 0;
  let totalDeficit = 0;
  let criticalDeficitLines = 0;
  let currency = 'USD';

  for (const line of args.projectLines) {
    const catalog = args.catalogById.get(line.partCatalogId);
    if (!catalog) continue;
    const variant = line.variantId ? args.variantById.get(line.variantId) ?? null : null;

    const onHand = variant ? variant.quantityOnHand : catalog.quantityOnHand;
    const demandKey = `${line.partCatalogId}:${line.variantId ?? 'NULL'}`;
    const otherDemand = args.otherDemand.get(demandKey) ?? 0;
    const free = Math.max(0, onHand - otherDemand);
    const deficit = Math.max(0, line.quantityNeeded - free);

    // Cheapest non-null priced link wins est_cost. We don't try to honour the
    // catalog's default_supplier_id here — that's a router-level preference;
    // the summary is "how much will this cost at the cheapest source?".
    const links = args.linksByCatalog.get(line.partCatalogId) ?? [];
    let bestLink: PartSupplierLink | null = null;
    for (const link of links) {
      if (link.unitPriceCents == null) continue;
      if (!bestLink || link.unitPriceCents < (bestLink.unitPriceCents ?? Infinity)) {
        bestLink = link;
      }
    }

    const estCostCents =
      bestLink && bestLink.unitPriceCents != null
        ? Math.round(bestLink.unitPriceCents * line.quantityNeeded)
        : null;
    if (estCostCents != null) {
      totalEstCostCents += estCostCents;
      currency = bestLink?.currency ?? currency;
    }

    totalDeficit += deficit;
    if (deficit > 0 && line.priority === 'critical') {
      criticalDeficitLines += 1;
    }

    rows.push({
      line,
      catalog,
      variant,
      needed: line.quantityNeeded,
      onHand,
      free,
      deficit,
      estCostCents,
      currency: bestLink?.currency ?? currency,
      cheapestLinkId: bestLink?.id ?? null,
    });
  }

  return {
    projectId: args.projectId,
    rows,
    totalEstCostCents,
    currency,
    totalDeficit,
    linesCount: rows.length,
    criticalDeficitLines,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validateBomPriority(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(BOM_PRIORITY_VALUES as readonly string[]).includes(value)
  ) {
    return `priority must be one of: ${BOM_PRIORITY_VALUES.join(', ')}.`;
  }
  return null;
}

/**
 * Quantity-needed must be a finite, positive number. NUMERIC accepts
 * fractional values (e.g. 1.5m of wire); the validator allows non-integer
 * but rejects zero / negative / non-finite.
 */
export function validateQuantityNeeded(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'quantity_needed must be a positive number.';
  }
  return null;
}
