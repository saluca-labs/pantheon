/**
 * Maker OS — database repository for projects, parts catalog, suppliers, and BOM.
 *
 * Phase 2 (v0.1.31) replaces the legacy per-project flat ``agos_maker_parts``
 * list with a workshop-global catalog + supplier directory + per-project BOM
 * (see migration 0035_maker_phase2). The repo grew accordingly:
 *
 *   - Projects CRUD (unchanged from Phase 1).
 *   - Part catalog CRUD (workshop-global, user-scoped).
 *   - Supplier CRUD.
 *   - Supplier-link CRUD (N:M between catalog rows and suppliers).
 *   - Variant CRUD (per catalog row).
 *   - BOM-line CRUD (per project).
 *   - BOM summary computation (deficit / free / est_cost).
 *
 * The legacy parts helpers (`listParts`/`createPart`/etc) are deleted in this
 * phase along with the underlying table; the `Build*` legacy aliases on the
 * project types remain for one more release.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getMakerPool } from './session';
import {
  PROJECT_STATUSES,
  coercePhaseProgress,
  phaseProgressDefault,
  type MakerPhase,
  type PhaseProgress,
  type ProjectStatus,
} from './projects';
import {
  PART_CATEGORY_VALUES,
  normalizeTags,
  type PartCategory,
  type PartCatalogRow,
  type PartCatalogUpsert,
  type PartVariant,
  type PartVariantUpsert,
} from './catalog';
import type {
  Supplier,
  SupplierUpsert,
  PartSupplierLink,
  PartSupplierLinkUpsert,
} from './suppliers';
import {
  ACTIVE_PROJECT_STATUSES,
  BOM_PRIORITY_VALUES,
  computeBomSummary,
  type BomLine,
  type BomLineUpsert,
  type BomLinePatch,
  type BomPriority,
  type BomSummary,
} from './bom';
import type {
  BuildStep,
  BuildStepUpsert,
  BuildStepPatch,
} from './steps';
import {
  coerceAttachedUrls,
  type BuildLogEntry,
  type BuildLogEntryUpsert,
  type BuildLogEntryPatch,
  type RecentLogEntry,
} from './log';
import type {
  BuildMilestone,
  BuildMilestoneUpsert,
  BuildMilestonePatch,
} from './milestones';
import {
  TOOL_KIND_VALUES,
  TOOL_STATUS_VALUES,
  type Tool,
  type ToolKind,
  type ToolStatus,
  type ToolUpsert,
  type ToolPatch,
  type ProjectToolLink,
  type ProjectToolLinkUpsert,
  type ProjectToolJoined,
} from './tools';
import type {
  ToolConsumable,
  ToolConsumableUpsert,
  ToolConsumablePatch,
} from './consumables';
import {
  MAINTENANCE_EVENT_KIND_VALUES,
  type MaintenanceEvent,
  type MaintenanceEventKind,
  type MaintenanceEventUpsert,
  type MaintenanceEventPatch,
} from './maintenance';
import {
  SPEC_SHEET_KIND_VALUES,
  validateAttachmentExclusivity,
  type SpecSheet,
  type SpecSheetKind,
  type SpecSheetUpsert,
  type SpecSheetPatch,
} from './spec-sheets';
import {
  REFERENCE_KIND_VALUES,
  type Reference,
  type ReferenceKind,
  type ReferenceUpsert,
  type ReferencePatch,
  type ProjectReferenceLink,
  type ProjectReferenceLinkUpsert,
  type ProjectReferenceLinkPatch,
  type ProjectReferenceJoined,
} from './references';
import {
  recordAudit as sharedRecordAudit,
  type RecordAuditArgs,
} from '../_shared/audit';

// ═══════════════════════════════════════════════════════════════════════════
// Projects (Phase 1, unchanged)
// ═══════════════════════════════════════════════════════════════════════════

export interface MakerProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  teamSize: number | null;
  phaseProgress: PhaseProgress;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMakerProjectInput {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  coverImageUrl?: string | null;
  targetCompletionDate?: string | null;
  teamSize?: number | null;
  phaseProgress?: PhaseProgress;
  metadata?: Record<string, unknown>;
}

export type UpdateMakerProjectInput = Partial<CreateMakerProjectInput>;

const PROJECT_COLUMNS = `id, user_id, name, description, status, tags,
                         cover_image_url, target_completion_date, team_size,
                         phase_progress, metadata,
                         created_at, updated_at`;

function rowToProject(row: any): MakerProject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    status: (row.status as ProjectStatus) ?? 'concept',
    tags: row.tags ?? [],
    coverImageUrl: row.cover_image_url ?? null,
    targetCompletionDate: row.target_completion_date
      ? new Date(row.target_completion_date).toISOString().slice(0, 10)
      : null,
    teamSize: row.team_size == null ? null : Number(row.team_size),
    phaseProgress: coercePhaseProgress(row.phase_progress),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listProjects(userId: string): Promise<MakerProject[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_maker_projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map(rowToProject);
}

export async function getProject(
  id: string,
  userId: string,
): Promise<MakerProject | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${PROJECT_COLUMNS}
       FROM agos_maker_projects
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProject(r.rows[0]);
}

export async function createProject(
  userId: string,
  data: CreateMakerProjectInput,
): Promise<MakerProject> {
  const pool = getMakerPool();
  const id = randomUUID();

  const status: ProjectStatus = data.status ?? 'concept';
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const phaseProgress = data.phaseProgress ?? phaseProgressDefault();

  await pool.query(
    `INSERT INTO agos_maker_projects
       (id, user_id, name, description, status, tags,
        cover_image_url, target_completion_date, team_size,
        phase_progress, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb)`,
    [
      id,
      userId,
      data.name,
      data.description ?? null,
      status,
      JSON.stringify(data.tags ?? []),
      data.coverImageUrl ?? null,
      data.targetCompletionDate ?? null,
      data.teamSize ?? null,
      JSON.stringify(phaseProgress),
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const project = await getProject(id, userId);
  if (!project) throw new Error('Failed to create maker project');
  return project;
}

export async function updateProject(
  id: string,
  userId: string,
  patch: UpdateMakerProjectInput,
): Promise<MakerProject | null> {
  const pool = getMakerPool();
  if (
    patch.status !== undefined &&
    !(PROJECT_STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  await pool.query(
    `UPDATE agos_maker_projects
        SET name                   = COALESCE($3,  name),
            description            = COALESCE($4,  description),
            status                 = COALESCE($5,  status),
            tags                   = COALESCE($6::jsonb, tags),
            cover_image_url        = COALESCE($7,  cover_image_url),
            target_completion_date = COALESCE($8,  target_completion_date),
            team_size              = COALESCE($9,  team_size),
            phase_progress         = COALESCE($10::jsonb, phase_progress),
            metadata               = COALESCE($11::jsonb, metadata),
            updated_at             = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
      patch.coverImageUrl ?? null,
      patch.targetCompletionDate ?? null,
      patch.teamSize ?? null,
      patch.phaseProgress ? JSON.stringify(patch.phaseProgress) : null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getProject(id, userId);
}

export async function updatePhaseProgress(
  id: string,
  userId: string,
  patch: Partial<Record<MakerPhase, number>>,
): Promise<MakerProject | null> {
  const current = await getProject(id, userId);
  if (!current) return null;
  const merged: PhaseProgress = { ...current.phaseProgress, ...patch };
  return updateProject(id, userId, { phaseProgress: coercePhaseProgress(merged) });
}

export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_projects WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Parts catalog
// ═══════════════════════════════════════════════════════════════════════════

const CATALOG_COLUMNS = `id, user_id, name, category, manufacturer, mfg_part_number,
                         unit, parent_part_catalog_id, quantity_on_hand,
                         default_supplier_id, datasheet_url, image_url,
                         tags, metadata, created_at, updated_at`;

function rowToCatalog(row: any): PartCatalogRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category as PartCategory,
    manufacturer: row.manufacturer ?? null,
    mfgPartNumber: row.mfg_part_number ?? null,
    unit: row.unit ?? 'pcs',
    parentPartCatalogId: row.parent_part_catalog_id ?? null,
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    defaultSupplierId: row.default_supplier_id ?? null,
    datasheetUrl: row.datasheet_url ?? null,
    imageUrl: row.image_url ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export interface ListCatalogArgs {
  userId: string;
  category?: PartCategory;
  search?: string;
  tag?: string;
}

export async function listCatalog(args: ListCatalogArgs): Promise<PartCatalogRow[]> {
  const pool = getMakerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];
  if (args.category) {
    if (!(PART_CATEGORY_VALUES as readonly string[]).includes(args.category)) {
      throw new Error(`Invalid category: ${args.category}`);
    }
    params.push(args.category);
    where.push(`category = $${params.length}`);
  }
  if (args.search && args.search.trim()) {
    params.push(`%${args.search.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(name) LIKE $${params.length}
        OR LOWER(COALESCE(manufacturer, '')) LIKE $${params.length}
        OR LOWER(COALESCE(mfg_part_number, '')) LIKE $${params.length})`,
    );
  }
  if (args.tag && args.tag.trim()) {
    params.push(args.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }
  const r = await pool.query(
    `SELECT ${CATALOG_COLUMNS}
       FROM agos_maker_part_catalog
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC`,
    params,
  );
  return r.rows.map(rowToCatalog);
}

export async function getCatalogRow(
  id: string,
  userId: string,
): Promise<PartCatalogRow | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${CATALOG_COLUMNS}
       FROM agos_maker_part_catalog
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToCatalog(r.rows[0]);
}

export async function createCatalogRow(
  userId: string,
  data: PartCatalogUpsert,
): Promise<PartCatalogRow> {
  const pool = getMakerPool();
  const id = randomUUID();
  const category: PartCategory = data.category ?? 'other';
  if (!(PART_CATEGORY_VALUES as readonly string[]).includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  const tags = normalizeTags(data.tags ?? []);

  await pool.query(
    `INSERT INTO agos_maker_part_catalog
       (id, user_id, name, category, manufacturer, mfg_part_number, unit,
        parent_part_catalog_id, quantity_on_hand, default_supplier_id,
        datasheet_url, image_url, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::jsonb)`,
    [
      id,
      userId,
      data.name,
      category,
      data.manufacturer ?? null,
      data.mfgPartNumber ?? null,
      data.unit ?? 'pcs',
      data.parentPartCatalogId ?? null,
      data.quantityOnHand ?? 0,
      data.defaultSupplierId ?? null,
      data.datasheetUrl ?? null,
      data.imageUrl ?? null,
      tags,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const row = await getCatalogRow(id, userId);
  if (!row) throw new Error('Failed to create catalog row');
  return row;
}

export async function updateCatalogRow(
  id: string,
  userId: string,
  patch: Partial<PartCatalogUpsert>,
): Promise<PartCatalogRow | null> {
  const pool = getMakerPool();
  if (
    patch.category !== undefined &&
    !(PART_CATEGORY_VALUES as readonly string[]).includes(patch.category)
  ) {
    throw new Error(`Invalid category: ${patch.category}`);
  }
  const tags = patch.tags ? normalizeTags(patch.tags) : null;
  await pool.query(
    `UPDATE agos_maker_part_catalog
        SET name                    = COALESCE($3,  name),
            category                = COALESCE($4,  category),
            manufacturer            = COALESCE($5,  manufacturer),
            mfg_part_number         = COALESCE($6,  mfg_part_number),
            unit                    = COALESCE($7,  unit),
            parent_part_catalog_id  = COALESCE($8,  parent_part_catalog_id),
            quantity_on_hand        = COALESCE($9,  quantity_on_hand),
            default_supplier_id     = COALESCE($10, default_supplier_id),
            datasheet_url           = COALESCE($11, datasheet_url),
            image_url               = COALESCE($12, image_url),
            tags                    = COALESCE($13::text[], tags),
            metadata                = COALESCE($14::jsonb, metadata),
            updated_at              = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.category ?? null,
      patch.manufacturer ?? null,
      patch.mfgPartNumber ?? null,
      patch.unit ?? null,
      patch.parentPartCatalogId ?? null,
      patch.quantityOnHand ?? null,
      patch.defaultSupplierId ?? null,
      patch.datasheetUrl ?? null,
      patch.imageUrl ?? null,
      tags,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getCatalogRow(id, userId);
}

export async function deleteCatalogRow(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_part_catalog WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Variants
// ═══════════════════════════════════════════════════════════════════════════

const VARIANT_COLUMNS = `id, part_catalog_id, variant_label, quantity_on_hand,
                         metadata, created_at, updated_at`;

function rowToVariant(row: any): PartVariant {
  return {
    id: row.id,
    partCatalogId: row.part_catalog_id,
    variantLabel: row.variant_label,
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function assertCatalogOwnership(
  catalogId: string,
  userId: string,
): Promise<void> {
  const row = await getCatalogRow(catalogId, userId);
  if (!row) throw new Error('Catalog row not found or not owned by user');
}

export async function listVariants(
  catalogId: string,
  userId: string,
): Promise<PartVariant[]> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${VARIANT_COLUMNS}
       FROM agos_maker_part_variants
      WHERE part_catalog_id = $1
      ORDER BY variant_label`,
    [catalogId],
  );
  return r.rows.map(rowToVariant);
}

export async function createVariant(
  catalogId: string,
  userId: string,
  data: PartVariantUpsert,
): Promise<PartVariant> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_part_variants
       (id, part_catalog_id, variant_label, quantity_on_hand, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      id,
      catalogId,
      data.variantLabel,
      data.quantityOnHand ?? 0,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const variants = await listVariants(catalogId, userId);
  const variant = variants.find((v) => v.id === id);
  if (!variant) throw new Error('Failed to create variant');
  return variant;
}

export async function updateVariant(
  id: string,
  catalogId: string,
  userId: string,
  patch: Partial<PartVariantUpsert>,
): Promise<PartVariant | null> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_part_variants
        SET variant_label    = COALESCE($3, variant_label),
            quantity_on_hand = COALESCE($4, quantity_on_hand),
            metadata         = COALESCE($5::jsonb, metadata),
            updated_at       = now()
      WHERE id = $1 AND part_catalog_id = $2`,
    [
      id,
      catalogId,
      patch.variantLabel ?? null,
      patch.quantityOnHand ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  const variants = await listVariants(catalogId, userId);
  return variants.find((v) => v.id === id) ?? null;
}

export async function deleteVariant(
  id: string,
  catalogId: string,
  userId: string,
): Promise<boolean> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_part_variants
      WHERE id = $1 AND part_catalog_id = $2`,
    [id, catalogId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Suppliers
// ═══════════════════════════════════════════════════════════════════════════

const SUPPLIER_COLUMNS = `id, user_id, name, homepage_url, notes, metadata,
                          created_at, updated_at`;

function rowToSupplier(row: any): Supplier {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    homepageUrl: row.homepage_url ?? null,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listSuppliers(userId: string): Promise<Supplier[]> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${SUPPLIER_COLUMNS}
       FROM agos_maker_suppliers
      WHERE user_id = $1
      ORDER BY name`,
    [userId],
  );
  return r.rows.map(rowToSupplier);
}

export async function getSupplier(
  id: string,
  userId: string,
): Promise<Supplier | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${SUPPLIER_COLUMNS}
       FROM agos_maker_suppliers
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSupplier(r.rows[0]);
}

export async function createSupplier(
  userId: string,
  data: SupplierUpsert,
): Promise<Supplier> {
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_suppliers
       (id, user_id, name, homepage_url, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      userId,
      data.name,
      data.homepageUrl ?? null,
      data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const supplier = await getSupplier(id, userId);
  if (!supplier) throw new Error('Failed to create supplier');
  return supplier;
}

export async function updateSupplier(
  id: string,
  userId: string,
  patch: Partial<SupplierUpsert>,
): Promise<Supplier | null> {
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_suppliers
        SET name         = COALESCE($3, name),
            homepage_url = COALESCE($4, homepage_url),
            notes        = COALESCE($5, notes),
            metadata     = COALESCE($6::jsonb, metadata),
            updated_at   = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.homepageUrl ?? null,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getSupplier(id, userId);
}

export async function deleteSupplier(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_suppliers WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Part-supplier links
// ═══════════════════════════════════════════════════════════════════════════

const LINK_COLUMNS = `id, part_catalog_id, supplier_id, supplier_part_number,
                      unit_price_cents, currency, lead_time_days, url,
                      last_priced_at, created_at, updated_at`;

function rowToLink(row: any): PartSupplierLink {
  return {
    id: row.id,
    partCatalogId: row.part_catalog_id,
    supplierId: row.supplier_id,
    supplierPartNumber: row.supplier_part_number ?? null,
    unitPriceCents: row.unit_price_cents == null ? null : Number(row.unit_price_cents),
    currency: row.currency ?? 'USD',
    leadTimeDays: row.lead_time_days == null ? null : Number(row.lead_time_days),
    url: row.url ?? null,
    lastPricedAt:
      row.last_priced_at instanceof Date
        ? row.last_priced_at.toISOString()
        : row.last_priced_at ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listSupplierLinks(
  catalogId: string,
  userId: string,
): Promise<PartSupplierLink[]> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_maker_part_supplier_links
      WHERE part_catalog_id = $1
      ORDER BY unit_price_cents ASC NULLS LAST, created_at ASC`,
    [catalogId],
  );
  return r.rows.map(rowToLink);
}

export async function createSupplierLink(
  catalogId: string,
  userId: string,
  data: PartSupplierLinkUpsert,
): Promise<PartSupplierLink> {
  await assertCatalogOwnership(catalogId, userId);
  // Verify the supplier belongs to the same user.
  const supplier = await getSupplier(data.supplierId, userId);
  if (!supplier) throw new Error('Supplier not found or not owned by user');

  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_part_supplier_links
       (id, part_catalog_id, supplier_id, supplier_part_number,
        unit_price_cents, currency, lead_time_days, url, last_priced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      catalogId,
      data.supplierId,
      data.supplierPartNumber ?? null,
      data.unitPriceCents ?? null,
      data.currency ?? 'USD',
      data.leadTimeDays ?? null,
      data.url ?? null,
      data.lastPricedAt ?? null,
    ],
  );
  const links = await listSupplierLinks(catalogId, userId);
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error('Failed to create supplier link');
  return link;
}

export async function updateSupplierLink(
  id: string,
  catalogId: string,
  userId: string,
  patch: Partial<PartSupplierLinkUpsert>,
): Promise<PartSupplierLink | null> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_part_supplier_links
        SET supplier_part_number = COALESCE($3,  supplier_part_number),
            unit_price_cents     = COALESCE($4,  unit_price_cents),
            currency             = COALESCE($5,  currency),
            lead_time_days       = COALESCE($6,  lead_time_days),
            url                  = COALESCE($7,  url),
            last_priced_at       = COALESCE($8,  last_priced_at),
            updated_at           = now()
      WHERE id = $1 AND part_catalog_id = $2`,
    [
      id,
      catalogId,
      patch.supplierPartNumber ?? null,
      patch.unitPriceCents ?? null,
      patch.currency ?? null,
      patch.leadTimeDays ?? null,
      patch.url ?? null,
      patch.lastPricedAt ?? null,
    ],
  );
  const links = await listSupplierLinks(catalogId, userId);
  return links.find((l) => l.id === id) ?? null;
}

export async function deleteSupplierLink(
  id: string,
  catalogId: string,
  userId: string,
): Promise<boolean> {
  await assertCatalogOwnership(catalogId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_part_supplier_links
      WHERE id = $1 AND part_catalog_id = $2`,
    [id, catalogId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOM lines
// ═══════════════════════════════════════════════════════════════════════════

const BOM_COLUMNS = `id, project_id, part_catalog_id, variant_id,
                     quantity_needed, notes, priority,
                     created_at, updated_at`;

function rowToBomLine(row: any): BomLine {
  return {
    id: row.id,
    projectId: row.project_id,
    partCatalogId: row.part_catalog_id,
    variantId: row.variant_id ?? null,
    quantityNeeded: Number(row.quantity_needed ?? 0),
    notes: row.notes ?? null,
    priority: (row.priority as BomPriority) ?? 'normal',
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function assertProjectOwnership(
  projectId: string,
  userId: string,
): Promise<void> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error('Project not found or not owned by user');
}

export async function listBomLines(
  projectId: string,
  userId: string,
): Promise<BomLine[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${BOM_COLUMNS}
       FROM agos_maker_bom_lines
      WHERE project_id = $1
      ORDER BY created_at ASC`,
    [projectId],
  );
  return r.rows.map(rowToBomLine);
}

export async function createBomLine(
  projectId: string,
  userId: string,
  data: BomLineUpsert,
): Promise<BomLine> {
  await assertProjectOwnership(projectId, userId);
  // Verify catalog row belongs to the same user.
  const catalog = await getCatalogRow(data.partCatalogId, userId);
  if (!catalog) throw new Error('Catalog row not found or not owned by user');

  if (
    data.priority !== undefined &&
    !(BOM_PRIORITY_VALUES as readonly string[]).includes(data.priority)
  ) {
    throw new Error(`Invalid priority: ${data.priority}`);
  }

  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_bom_lines
       (id, project_id, part_catalog_id, variant_id,
        quantity_needed, notes, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      projectId,
      data.partCatalogId,
      data.variantId ?? null,
      data.quantityNeeded,
      data.notes ?? null,
      data.priority ?? 'normal',
    ],
  );
  const lines = await listBomLines(projectId, userId);
  const line = lines.find((l) => l.id === id);
  if (!line) throw new Error('Failed to create BOM line');
  return line;
}

export async function updateBomLine(
  id: string,
  projectId: string,
  userId: string,
  patch: BomLinePatch,
): Promise<BomLine | null> {
  await assertProjectOwnership(projectId, userId);
  if (
    patch.priority !== undefined &&
    !(BOM_PRIORITY_VALUES as readonly string[]).includes(patch.priority)
  ) {
    throw new Error(`Invalid priority: ${patch.priority}`);
  }
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_bom_lines
        SET variant_id      = CASE WHEN $3::boolean THEN $4 ELSE variant_id END,
            quantity_needed = COALESCE($5, quantity_needed),
            notes           = COALESCE($6, notes),
            priority        = COALESCE($7, priority),
            updated_at      = now()
      WHERE id = $1 AND project_id = $2`,
    [
      id,
      projectId,
      patch.variantId !== undefined,
      patch.variantId ?? null,
      patch.quantityNeeded ?? null,
      patch.notes ?? null,
      patch.priority ?? null,
    ],
  );
  const lines = await listBomLines(projectId, userId);
  return lines.find((l) => l.id === id) ?? null;
}

export async function deleteBomLine(
  id: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_bom_lines
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOM summary
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the per-line BOM summary for one project.
 *
 * Loads:
 *   - The project's BOM lines.
 *   - All catalog rows referenced by those lines.
 *   - Variants for those catalog rows.
 *   - Demand from OTHER active projects' BOM lines (aggregated by
 *     catalog + variant).
 *   - All supplier links for those catalog rows.
 *
 * Then delegates the actual deficit / est-cost math to the pure helper in
 * `bom.ts`.
 */
export async function getBomSummary(
  projectId: string,
  userId: string,
): Promise<BomSummary> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();

  const linesRes = await pool.query(
    `SELECT ${BOM_COLUMNS}
       FROM agos_maker_bom_lines
      WHERE project_id = $1
      ORDER BY created_at ASC`,
    [projectId],
  );
  const projectLines = linesRes.rows.map(rowToBomLine);

  if (projectLines.length === 0) {
    return {
      projectId,
      rows: [],
      totalEstCostCents: 0,
      currency: 'USD',
      totalDeficit: 0,
      linesCount: 0,
      criticalDeficitLines: 0,
    };
  }

  const catalogIds = Array.from(new Set(projectLines.map((l) => l.partCatalogId)));
  const variantIds = Array.from(
    new Set(projectLines.map((l) => l.variantId).filter((v): v is string => v != null)),
  );

  const catalogRes = await pool.query(
    `SELECT ${CATALOG_COLUMNS}
       FROM agos_maker_part_catalog
      WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [catalogIds, userId],
  );
  const catalogById = new Map<string, PartCatalogRow>();
  for (const r of catalogRes.rows) catalogById.set(r.id, rowToCatalog(r));

  const variantById = new Map<string, PartVariant>();
  if (variantIds.length > 0) {
    const variantRes = await pool.query(
      `SELECT ${VARIANT_COLUMNS}
         FROM agos_maker_part_variants
        WHERE id = ANY($1::uuid[])`,
      [variantIds],
    );
    for (const r of variantRes.rows) variantById.set(r.id, rowToVariant(r));
  }

  // Aggregate demand from OTHER active projects' BOM lines, by
  // (part_catalog_id, variant_id). Excludes the target project so we
  // don't double-count its own demand.
  const otherDemandRes = await pool.query(
    `SELECT b.part_catalog_id,
            b.variant_id,
            SUM(b.quantity_needed) AS demand
       FROM agos_maker_bom_lines b
       JOIN agos_maker_projects p ON p.id = b.project_id
      WHERE p.user_id = $1
        AND p.id <> $2
        AND p.status = ANY($3::text[])
        AND b.part_catalog_id = ANY($4::uuid[])
      GROUP BY b.part_catalog_id, b.variant_id`,
    [userId, projectId, [...ACTIVE_PROJECT_STATUSES], catalogIds],
  );
  const otherDemand = new Map<string, number>();
  for (const r of otherDemandRes.rows) {
    const key = `${r.part_catalog_id}:${r.variant_id ?? 'NULL'}`;
    otherDemand.set(key, Number(r.demand ?? 0));
  }

  const linksRes = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_maker_part_supplier_links
      WHERE part_catalog_id = ANY($1::uuid[])`,
    [catalogIds],
  );
  const linksByCatalog = new Map<string, PartSupplierLink[]>();
  for (const r of linksRes.rows) {
    const link = rowToLink(r);
    const arr = linksByCatalog.get(link.partCatalogId) ?? [];
    arr.push(link);
    linksByCatalog.set(link.partCatalogId, arr);
  }

  return computeBomSummary({
    projectId,
    projectLines,
    otherDemand,
    catalogById,
    variantById,
    linksByCatalog,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Build steps (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

const STEP_COLUMNS = `id, project_id, ordinal, title, body, est_minutes,
                      completed_at, blocker_text, metadata,
                      created_at, updated_at`;

function rowToStep(row: any): BuildStep {
  return {
    id: row.id,
    projectId: row.project_id,
    ordinal: Number(row.ordinal ?? 0),
    title: row.title,
    body: row.body ?? null,
    estMinutes: row.est_minutes == null ? null : Number(row.est_minutes),
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at ?? null,
    blockerText: row.blocker_text ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listBuildSteps(
  projectId: string,
  userId: string,
): Promise<BuildStep[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${STEP_COLUMNS}
       FROM agos_maker_build_steps
      WHERE project_id = $1
      ORDER BY ordinal ASC, created_at ASC`,
    [projectId],
  );
  return r.rows.map(rowToStep);
}

export async function getBuildStep(
  id: string,
  projectId: string,
  userId: string,
): Promise<BuildStep | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${STEP_COLUMNS}
       FROM agos_maker_build_steps
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToStep(r.rows[0]);
}

export async function createBuildStep(
  projectId: string,
  userId: string,
  data: BuildStepUpsert,
): Promise<BuildStep> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const id = randomUUID();

  // Compute the next ordinal in the same transaction-window as the insert.
  // If the caller passed an explicit ordinal we honour it; otherwise grab
  // MAX(ordinal)+1, defaulting to 1 for the first step.
  let ordinal = data.ordinal;
  if (ordinal == null) {
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal
         FROM agos_maker_build_steps
        WHERE project_id = $1`,
      [projectId],
    );
    ordinal = Number(maxRes.rows[0]?.next_ordinal ?? 1);
  }

  await pool.query(
    `INSERT INTO agos_maker_build_steps
       (id, project_id, ordinal, title, body, est_minutes,
        blocker_text, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      id,
      projectId,
      ordinal,
      data.title,
      data.body ?? null,
      data.estMinutes ?? null,
      data.blockerText ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const step = await getBuildStep(id, projectId, userId);
  if (!step) throw new Error('Failed to create build step');
  return step;
}

export async function updateBuildStep(
  id: string,
  projectId: string,
  userId: string,
  patch: BuildStepPatch,
): Promise<BuildStep | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_build_steps
        SET title        = COALESCE($3,  title),
            body         = COALESCE($4,  body),
            est_minutes  = COALESCE($5,  est_minutes),
            blocker_text = COALESCE($6,  blocker_text),
            ordinal      = COALESCE($7,  ordinal),
            metadata     = COALESCE($8::jsonb, metadata),
            updated_at   = now()
      WHERE id = $1 AND project_id = $2`,
    [
      id,
      projectId,
      patch.title ?? null,
      patch.body ?? null,
      patch.estMinutes ?? null,
      patch.blockerText ?? null,
      patch.ordinal ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getBuildStep(id, projectId, userId);
}

export async function deleteBuildStep(
  id: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_build_steps
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * One-click complete (or undo) for a build step.
 *
 * Idempotent: calling twice with the same `undo` flag is a no-op against
 * the persisted state. The implementation uses a conditional UPDATE so the
 * row is only written when the toggle actually changes the value.
 *
 * @param undo When false (default) sets completed_at = now() if NULL.
 *             When true clears completed_at to NULL if currently set.
 */
export async function completeStep(
  stepId: string,
  projectId: string,
  userId: string,
  options: { undo?: boolean } = {},
): Promise<BuildStep | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  if (options.undo) {
    await pool.query(
      `UPDATE agos_maker_build_steps
          SET completed_at = NULL, updated_at = now()
        WHERE id = $1 AND project_id = $2 AND completed_at IS NOT NULL`,
      [stepId, projectId],
    );
  } else {
    await pool.query(
      `UPDATE agos_maker_build_steps
          SET completed_at = now(), updated_at = now()
        WHERE id = $1 AND project_id = $2 AND completed_at IS NULL`,
      [stepId, projectId],
    );
  }
  return getBuildStep(stepId, projectId, userId);
}

/**
 * Reorder all of a project's build steps into 1..N using the given
 * sequence. Unknown ids are ignored; steps not mentioned in the input keep
 * their relative order and are appended to the end.
 *
 * Implemented as a two-pass UPDATE inside a single transaction so the
 * (project, ordinal) unique-by-convention sort order never collides
 * mid-update. (There is no DB-level unique constraint on (project_id,
 * ordinal); the two-pass renumber is still the cleanest pattern, mirroring
 * `reorderShootingDays` in the Filmmaker repo.)
 */
export async function reorderBuildSteps(
  projectId: string,
  userId: string,
  orderedStepIds: string[],
): Promise<void> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingRes = await client.query(
      `SELECT id FROM agos_maker_build_steps
        WHERE project_id = $1
        ORDER BY ordinal ASC, created_at ASC`,
      [projectId],
    );
    const existing: string[] = existingRes.rows.map((r: any) => r.id);
    const existingSet = new Set(existing);
    const seen = new Set<string>();
    const finalOrder: string[] = [];
    for (const id of orderedStepIds) {
      if (existingSet.has(id) && !seen.has(id)) {
        finalOrder.push(id);
        seen.add(id);
      }
    }
    for (const id of existing) {
      if (!seen.has(id)) {
        finalOrder.push(id);
        seen.add(id);
      }
    }
    // Two-pass renumber.
    for (let i = 0; i < finalOrder.length; i++) {
      await client.query(
        `UPDATE agos_maker_build_steps
            SET ordinal = -($2::int + 1), updated_at = now()
          WHERE id = $1`,
        [finalOrder[i], i],
      );
    }
    for (let i = 0; i < finalOrder.length; i++) {
      await client.query(
        `UPDATE agos_maker_build_steps
            SET ordinal = $2, updated_at = now()
          WHERE id = $1`,
        [finalOrder[i], i + 1],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Build log entries (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

const LOG_COLUMNS = `id, project_id, step_id, body, attached_urls,
                     author_id, created_at`;

function rowToLogEntry(row: any): BuildLogEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    stepId: row.step_id ?? null,
    body: row.body,
    attachedUrls: coerceAttachedUrls(row.attached_urls),
    authorId: row.author_id ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export interface ListLogEntriesArgs {
  projectId: string;
  userId: string;
  stepId?: string | null;
  limit?: number;
  before?: string;
}

export async function listLogEntries(args: ListLogEntriesArgs): Promise<BuildLogEntry[]> {
  await assertProjectOwnership(args.projectId, args.userId);
  const pool = getMakerPool();
  const params: any[] = [args.projectId];
  const where: string[] = ['project_id = $1'];
  if (args.stepId !== undefined && args.stepId !== null) {
    params.push(args.stepId);
    where.push(`step_id = $${params.length}`);
  }
  if (args.before) {
    params.push(args.before);
    where.push(`created_at < $${params.length}`);
  }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${LOG_COLUMNS}
       FROM agos_maker_build_log_entries
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowToLogEntry);
}

export async function getLogEntry(
  id: string,
  projectId: string,
  userId: string,
): Promise<BuildLogEntry | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${LOG_COLUMNS}
       FROM agos_maker_build_log_entries
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLogEntry(r.rows[0]);
}

export async function createLogEntry(
  projectId: string,
  userId: string,
  data: BuildLogEntryUpsert,
): Promise<BuildLogEntry> {
  await assertProjectOwnership(projectId, userId);
  // If the caller scoped the entry to a step, verify the step belongs to
  // the same project so cross-project leakage is impossible.
  if (data.stepId) {
    const step = await getBuildStep(data.stepId, projectId, userId);
    if (!step) throw new Error('Step not found or not owned by user');
  }
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_build_log_entries
       (id, project_id, step_id, body, attached_urls, author_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      id,
      projectId,
      data.stepId ?? null,
      data.body,
      JSON.stringify(data.attachedUrls ?? []),
      userId,
    ],
  );
  const entry = await getLogEntry(id, projectId, userId);
  if (!entry) throw new Error('Failed to create build log entry');
  return entry;
}

export async function updateLogEntry(
  id: string,
  projectId: string,
  userId: string,
  patch: BuildLogEntryPatch,
): Promise<BuildLogEntry | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const attached =
    patch.attachedUrls !== undefined ? JSON.stringify(patch.attachedUrls) : null;
  await pool.query(
    `UPDATE agos_maker_build_log_entries
        SET body          = COALESCE($3, body),
            attached_urls = COALESCE($4::jsonb, attached_urls)
      WHERE id = $1 AND project_id = $2`,
    [id, projectId, patch.body ?? null, attached],
  );
  return getLogEntry(id, projectId, userId);
}

export async function deleteLogEntry(
  id: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_build_log_entries
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Top-N recent log entries across all of a user's projects, joined to the
 * project name. Used by the hub-level recent-activity widget — bounded by
 * `limit` (default 5, max 25). Ordered by created_at DESC.
 */
export async function listRecentLogEntries(
  userId: string,
  limit = 5,
): Promise<RecentLogEntry[]> {
  const pool = getMakerPool();
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const r = await pool.query(
    `SELECT e.id, e.project_id, e.step_id, e.body, e.attached_urls,
            e.author_id, e.created_at, p.name AS project_name
       FROM agos_maker_build_log_entries e
       JOIN agos_maker_projects p ON p.id = e.project_id
      WHERE p.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [userId, safeLimit],
  );
  return r.rows.map((row: any) => ({
    ...rowToLogEntry(row),
    projectName: row.project_name ?? 'Untitled project',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Build milestones (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

const MILESTONE_COLUMNS = `id, project_id, label, due_at, completed_at,
                           sort_order, notes, metadata,
                           created_at, updated_at`;

function rowToMilestone(row: any): BuildMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    dueAt: row.due_at
      ? row.due_at instanceof Date
        ? row.due_at.toISOString().slice(0, 10)
        : String(row.due_at).slice(0, 10)
      : null,
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listMilestones(
  projectId: string,
  userId: string,
): Promise<BuildMilestone[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${MILESTONE_COLUMNS}
       FROM agos_maker_build_milestones
      WHERE project_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  );
  return r.rows.map(rowToMilestone);
}

export async function getMilestone(
  id: string,
  projectId: string,
  userId: string,
): Promise<BuildMilestone | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${MILESTONE_COLUMNS}
       FROM agos_maker_build_milestones
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToMilestone(r.rows[0]);
}

export async function createMilestone(
  projectId: string,
  userId: string,
  data: BuildMilestoneUpsert,
): Promise<BuildMilestone> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_build_milestones
       (id, project_id, label, due_at, sort_order, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      projectId,
      data.label,
      data.dueAt ?? null,
      data.sortOrder ?? 0,
      data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const m = await getMilestone(id, projectId, userId);
  if (!m) throw new Error('Failed to create milestone');
  return m;
}

export async function updateMilestone(
  id: string,
  projectId: string,
  userId: string,
  patch: BuildMilestonePatch,
): Promise<BuildMilestone | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_build_milestones
        SET label      = COALESCE($3, label),
            due_at     = CASE WHEN $4::boolean THEN $5::date ELSE due_at END,
            sort_order = COALESCE($6, sort_order),
            notes      = COALESCE($7, notes),
            metadata   = COALESCE($8::jsonb, metadata),
            updated_at = now()
      WHERE id = $1 AND project_id = $2`,
    [
      id,
      projectId,
      patch.label ?? null,
      patch.dueAt !== undefined,
      patch.dueAt ?? null,
      patch.sortOrder ?? null,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getMilestone(id, projectId, userId);
}

export async function deleteMilestone(
  id: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_build_milestones
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Toggle a milestone's `completed_at`. When currently NULL, sets to now();
 * when set, clears to NULL. Both branches are idempotent against repeated
 * calls in the same state (no row write when the target state matches the
 * current state).
 */
export async function toggleMilestoneComplete(
  id: string,
  projectId: string,
  userId: string,
): Promise<BuildMilestone | null> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_build_milestones
        SET completed_at = CASE WHEN completed_at IS NULL THEN now() ELSE NULL END,
            updated_at   = now()
      WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return getMilestone(id, projectId, userId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tools (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const TOOL_COLUMNS = `id, user_id, name, kind, manufacturer, model, serial,
                      location, status, purchased_at, image_url, datasheet_url,
                      manual_url, notes, tags, metadata,
                      created_at, updated_at`;

function rowToTool(row: any): Tool {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind as ToolKind,
    manufacturer: row.manufacturer ?? null,
    model: row.model ?? null,
    serial: row.serial ?? null,
    location: row.location ?? null,
    status: (row.status as ToolStatus) ?? 'active',
    purchasedAt: row.purchased_at
      ? row.purchased_at instanceof Date
        ? row.purchased_at.toISOString().slice(0, 10)
        : String(row.purchased_at).slice(0, 10)
      : null,
    imageUrl: row.image_url ?? null,
    datasheetUrl: row.datasheet_url ?? null,
    manualUrl: row.manual_url ?? null,
    notes: row.notes ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export interface ListToolsArgs {
  userId: string;
  status?: ToolStatus;
  kind?: ToolKind;
  tag?: string;
}

export async function listTools(args: ListToolsArgs): Promise<Tool[]> {
  const pool = getMakerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];
  if (args.status) {
    if (!(TOOL_STATUS_VALUES as readonly string[]).includes(args.status)) {
      throw new Error(`Invalid status: ${args.status}`);
    }
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  if (args.kind) {
    if (!(TOOL_KIND_VALUES as readonly string[]).includes(args.kind)) {
      throw new Error(`Invalid kind: ${args.kind}`);
    }
    params.push(args.kind);
    where.push(`kind = $${params.length}`);
  }
  if (args.tag && args.tag.trim()) {
    params.push(args.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }
  const r = await pool.query(
    `SELECT ${TOOL_COLUMNS}
       FROM agos_maker_tools
      WHERE ${where.join(' AND ')}
      ORDER BY status ASC, name ASC`,
    params,
  );
  return r.rows.map(rowToTool);
}

export async function getTool(
  id: string,
  userId: string,
): Promise<Tool | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${TOOL_COLUMNS}
       FROM agos_maker_tools
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTool(r.rows[0]);
}

export async function createTool(
  userId: string,
  data: ToolUpsert,
): Promise<Tool> {
  if (!(TOOL_KIND_VALUES as readonly string[]).includes(data.kind)) {
    throw new Error(`Invalid kind: ${data.kind}`);
  }
  const status: ToolStatus = data.status ?? 'active';
  if (!(TOOL_STATUS_VALUES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_tools
       (id, user_id, name, kind, manufacturer, model, serial, location,
        status, purchased_at, image_url, datasheet_url, manual_url,
        notes, tags, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15::text[], $16::jsonb)`,
    [
      id,
      userId,
      data.name,
      data.kind,
      data.manufacturer ?? null,
      data.model ?? null,
      data.serial ?? null,
      data.location ?? null,
      status,
      data.purchasedAt ?? null,
      data.imageUrl ?? null,
      data.datasheetUrl ?? null,
      data.manualUrl ?? null,
      data.notes ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const tool = await getTool(id, userId);
  if (!tool) throw new Error('Failed to create tool');
  return tool;
}

export async function updateTool(
  id: string,
  userId: string,
  patch: ToolPatch,
): Promise<Tool | null> {
  if (
    patch.kind !== undefined &&
    !(TOOL_KIND_VALUES as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid kind: ${patch.kind}`);
  }
  if (
    patch.status !== undefined &&
    !(TOOL_STATUS_VALUES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_tools
        SET name          = COALESCE($3,  name),
            kind          = COALESCE($4,  kind),
            manufacturer  = COALESCE($5,  manufacturer),
            model         = COALESCE($6,  model),
            serial        = COALESCE($7,  serial),
            location      = COALESCE($8,  location),
            status        = COALESCE($9,  status),
            purchased_at  = COALESCE($10, purchased_at),
            image_url     = COALESCE($11, image_url),
            datasheet_url = COALESCE($12, datasheet_url),
            manual_url    = COALESCE($13, manual_url),
            notes         = COALESCE($14, notes),
            tags          = COALESCE($15::text[], tags),
            metadata      = COALESCE($16::jsonb, metadata),
            updated_at    = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.kind ?? null,
      patch.manufacturer ?? null,
      patch.model ?? null,
      patch.serial ?? null,
      patch.location ?? null,
      patch.status ?? null,
      patch.purchasedAt ?? null,
      patch.imageUrl ?? null,
      patch.datasheetUrl ?? null,
      patch.manualUrl ?? null,
      patch.notes ?? null,
      patch.tags ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getTool(id, userId);
}

export async function deleteTool(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_tools WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function assertToolOwnership(
  toolId: string,
  userId: string,
): Promise<void> {
  const tool = await getTool(toolId, userId);
  if (!tool) throw new Error('Tool not found or not owned by user');
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool consumables (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMABLE_COLUMNS = `id, tool_id, name, kind, hours_remaining,
                            max_hours, last_replaced_at, notes, metadata,
                            created_at, updated_at`;

function rowToConsumable(row: any): ToolConsumable {
  return {
    id: row.id,
    toolId: row.tool_id,
    name: row.name,
    kind: row.kind ?? null,
    hoursRemaining:
      row.hours_remaining == null ? null : Number(row.hours_remaining),
    maxHours: row.max_hours == null ? null : Number(row.max_hours),
    lastReplacedAt:
      row.last_replaced_at instanceof Date
        ? row.last_replaced_at.toISOString()
        : row.last_replaced_at ?? null,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listConsumables(
  toolId: string,
  userId: string,
): Promise<ToolConsumable[]> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${CONSUMABLE_COLUMNS}
       FROM agos_maker_tool_consumables
      WHERE tool_id = $1
      ORDER BY name ASC`,
    [toolId],
  );
  return r.rows.map(rowToConsumable);
}

export async function getConsumable(
  id: string,
  toolId: string,
  userId: string,
): Promise<ToolConsumable | null> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${CONSUMABLE_COLUMNS}
       FROM agos_maker_tool_consumables
      WHERE id = $1 AND tool_id = $2`,
    [id, toolId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToConsumable(r.rows[0]);
}

export async function createConsumable(
  toolId: string,
  userId: string,
  data: ToolConsumableUpsert,
): Promise<ToolConsumable> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_tool_consumables
       (id, tool_id, name, kind, hours_remaining, max_hours,
        last_replaced_at, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      id,
      toolId,
      data.name,
      data.kind ?? null,
      data.hoursRemaining ?? null,
      data.maxHours ?? null,
      data.lastReplacedAt ?? null,
      data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const c = await getConsumable(id, toolId, userId);
  if (!c) throw new Error('Failed to create consumable');
  return c;
}

export async function updateConsumable(
  id: string,
  toolId: string,
  userId: string,
  patch: ToolConsumablePatch,
): Promise<ToolConsumable | null> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_tool_consumables
        SET name             = COALESCE($3, name),
            kind             = COALESCE($4, kind),
            hours_remaining  = COALESCE($5, hours_remaining),
            max_hours        = COALESCE($6, max_hours),
            last_replaced_at = COALESCE($7, last_replaced_at),
            notes            = COALESCE($8, notes),
            metadata         = COALESCE($9::jsonb, metadata),
            updated_at       = now()
      WHERE id = $1 AND tool_id = $2`,
    [
      id,
      toolId,
      patch.name ?? null,
      patch.kind ?? null,
      patch.hoursRemaining ?? null,
      patch.maxHours ?? null,
      patch.lastReplacedAt ?? null,
      patch.notes ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getConsumable(id, toolId, userId);
}

export async function deleteConsumable(
  id: string,
  toolId: string,
  userId: string,
): Promise<boolean> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_tool_consumables
      WHERE id = $1 AND tool_id = $2`,
    [id, toolId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool maintenance events (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const MAINTENANCE_COLUMNS = `id, tool_id, event_kind, performed_at,
                             cost_cents, currency, vendor, notes,
                             next_due_at, metadata, created_at`;

function rowToMaintenanceEvent(row: any): MaintenanceEvent {
  return {
    id: row.id,
    toolId: row.tool_id,
    eventKind: row.event_kind as MaintenanceEventKind,
    performedAt:
      row.performed_at instanceof Date
        ? row.performed_at.toISOString()
        : String(row.performed_at),
    costCents: row.cost_cents == null ? null : Number(row.cost_cents),
    currency: row.currency ?? 'USD',
    vendor: row.vendor ?? null,
    notes: row.notes ?? null,
    nextDueAt:
      row.next_due_at instanceof Date
        ? row.next_due_at.toISOString()
        : row.next_due_at ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function listMaintenanceEvents(
  toolId: string,
  userId: string,
): Promise<MaintenanceEvent[]> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${MAINTENANCE_COLUMNS}
       FROM agos_maker_tool_maintenance
      WHERE tool_id = $1
      ORDER BY performed_at DESC`,
    [toolId],
  );
  return r.rows.map(rowToMaintenanceEvent);
}

export async function getMaintenanceEvent(
  id: string,
  toolId: string,
  userId: string,
): Promise<MaintenanceEvent | null> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${MAINTENANCE_COLUMNS}
       FROM agos_maker_tool_maintenance
      WHERE id = $1 AND tool_id = $2`,
    [id, toolId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToMaintenanceEvent(r.rows[0]);
}

export async function createMaintenanceEvent(
  toolId: string,
  userId: string,
  data: MaintenanceEventUpsert,
): Promise<MaintenanceEvent> {
  if (
    !(MAINTENANCE_EVENT_KIND_VALUES as readonly string[]).includes(data.eventKind)
  ) {
    throw new Error(`Invalid event_kind: ${data.eventKind}`);
  }
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_tool_maintenance
       (id, tool_id, event_kind, performed_at, cost_cents, currency,
        vendor, notes, next_due_at, metadata)
     VALUES ($1, $2, $3, COALESCE($4, now()), $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      id,
      toolId,
      data.eventKind,
      data.performedAt ?? null,
      data.costCents ?? null,
      data.currency ?? 'USD',
      data.vendor ?? null,
      data.notes ?? null,
      data.nextDueAt ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const ev = await getMaintenanceEvent(id, toolId, userId);
  if (!ev) throw new Error('Failed to create maintenance event');
  return ev;
}

export async function updateMaintenanceEvent(
  id: string,
  toolId: string,
  userId: string,
  patch: MaintenanceEventPatch,
): Promise<MaintenanceEvent | null> {
  if (
    patch.eventKind !== undefined &&
    !(MAINTENANCE_EVENT_KIND_VALUES as readonly string[]).includes(patch.eventKind)
  ) {
    throw new Error(`Invalid event_kind: ${patch.eventKind}`);
  }
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_tool_maintenance
        SET event_kind   = COALESCE($3, event_kind),
            performed_at = COALESCE($4, performed_at),
            cost_cents   = COALESCE($5, cost_cents),
            currency     = COALESCE($6, currency),
            vendor       = COALESCE($7, vendor),
            notes        = COALESCE($8, notes),
            next_due_at  = COALESCE($9, next_due_at),
            metadata     = COALESCE($10::jsonb, metadata)
      WHERE id = $1 AND tool_id = $2`,
    [
      id,
      toolId,
      patch.eventKind ?? null,
      patch.performedAt ?? null,
      patch.costCents ?? null,
      patch.currency ?? null,
      patch.vendor ?? null,
      patch.notes ?? null,
      patch.nextDueAt ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getMaintenanceEvent(id, toolId, userId);
}

export async function deleteMaintenanceEvent(
  id: string,
  toolId: string,
  userId: string,
): Promise<boolean> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_tool_maintenance
      WHERE id = $1 AND tool_id = $2`,
    [id, toolId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Project-tool join (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_TOOL_COLUMNS = `id, project_id, tool_id, required, notes, created_at`;

function rowToProjectToolLink(row: any): ProjectToolLink {
  return {
    id: row.id,
    projectId: row.project_id,
    toolId: row.tool_id,
    required: row.required === true,
    notes: row.notes ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * List the tools attached to a project, joined with each tool's name, kind,
 * and status so the UI can render a row without a second fetch.
 *
 * Cross-ownership check: only returns rows where BOTH the project and the
 * tool belong to the requesting user. A stale link to a tool transferred
 * to another user would be silently filtered out.
 */
export async function listToolsForProject(
  projectId: string,
  userId: string,
): Promise<ProjectToolJoined[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT pt.id, pt.project_id, pt.tool_id, pt.required, pt.notes,
            pt.created_at,
            t.name AS tool_name, t.kind AS tool_kind, t.status AS tool_status
       FROM agos_maker_project_tools pt
       JOIN agos_maker_tools t ON t.id = pt.tool_id
      WHERE pt.project_id = $1
        AND t.user_id = $2
      ORDER BY pt.required DESC, t.name ASC`,
    [projectId, userId],
  );
  return r.rows.map((row: any) => ({
    ...rowToProjectToolLink(row),
    toolName: row.tool_name,
    toolKind: row.tool_kind as ToolKind,
    toolStatus: (row.tool_status as ToolStatus) ?? 'active',
  }));
}

/**
 * Attach a tool to a project. Cross-ownership check: BOTH the project and
 * the tool must belong to the requesting user; otherwise throws. Duplicate
 * (project_id, tool_id) attaches throw a unique-constraint error which the
 * route maps to 409.
 */
export async function attachToolToProject(
  projectId: string,
  toolId: string,
  userId: string,
  options: { required?: boolean; notes?: string | null } = {},
): Promise<ProjectToolLink> {
  await assertProjectOwnership(projectId, userId);
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_project_tools
       (id, project_id, tool_id, required, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      projectId,
      toolId,
      options.required ?? true,
      options.notes ?? null,
    ],
  );
  const links = await listToolsForProject(projectId, userId);
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error('Failed to attach tool to project');
  return link;
}

/**
 * Update an existing project-tool link — toggle `required` or rewrite the
 * notes. Returns the joined row on success, or null when no row matched.
 */
export async function updateProjectToolLink(
  projectId: string,
  toolId: string,
  userId: string,
  patch: { required?: boolean; notes?: string | null },
): Promise<ProjectToolJoined | null> {
  await assertProjectOwnership(projectId, userId);
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_project_tools
        SET required = COALESCE($3, required),
            notes    = COALESCE($4, notes)
      WHERE project_id = $1 AND tool_id = $2`,
    [
      projectId,
      toolId,
      patch.required === undefined ? null : patch.required,
      patch.notes ?? null,
    ],
  );
  const links = await listToolsForProject(projectId, userId);
  return links.find((l) => l.toolId === toolId) ?? null;
}

export async function detachToolFromProject(
  projectId: string,
  toolId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_project_tools
      WHERE project_id = $1 AND tool_id = $2`,
    [projectId, toolId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * List the projects that link a given tool. Used by the tool detail page's
 * "Projects using this tool" panel.
 */
export interface ToolProjectUsage {
  projectId: string;
  projectName: string;
  projectStatus: string;
  required: boolean;
}

export async function listProjectsUsingTool(
  toolId: string,
  userId: string,
): Promise<ToolProjectUsage[]> {
  await assertToolOwnership(toolId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT p.id AS project_id, p.name AS project_name, p.status AS project_status,
            pt.required
       FROM agos_maker_project_tools pt
       JOIN agos_maker_projects p ON p.id = pt.project_id
      WHERE pt.tool_id = $1
        AND p.user_id = $2
      ORDER BY p.updated_at DESC`,
    [toolId, userId],
  );
  return r.rows.map((row: any) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    projectStatus: row.project_status,
    required: row.required === true,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Spec sheets (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

const SPEC_SHEET_COLUMNS = `id, user_id, title, kind, url, notes, revision,
                            issued_at, part_id, tool_id, project_id, tags,
                            metadata, created_at, updated_at`;

function rowToSpecSheet(row: any): SpecSheet {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    kind: (row.kind as SpecSheetKind) ?? 'datasheet',
    url: row.url,
    notes: row.notes ?? null,
    revision: row.revision ?? null,
    issuedAt: row.issued_at
      ? row.issued_at instanceof Date
        ? row.issued_at.toISOString().slice(0, 10)
        : String(row.issued_at).slice(0, 10)
      : null,
    partId: row.part_id ?? null,
    toolId: row.tool_id ?? null,
    projectId: row.project_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export interface ListSpecSheetsArgs {
  userId: string;
  /** Filter by attachment kind. */
  attachment?: 'part' | 'tool' | 'project';
  partId?: string;
  toolId?: string;
  projectId?: string;
  kind?: SpecSheetKind;
  tag?: string;
}

export async function listSpecSheets(args: ListSpecSheetsArgs): Promise<SpecSheet[]> {
  const pool = getMakerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];

  if (args.attachment === 'part') where.push(`part_id IS NOT NULL`);
  else if (args.attachment === 'tool') where.push(`tool_id IS NOT NULL`);
  else if (args.attachment === 'project') where.push(`project_id IS NOT NULL`);

  if (args.partId) {
    params.push(args.partId);
    where.push(`part_id = $${params.length}`);
  }
  if (args.toolId) {
    params.push(args.toolId);
    where.push(`tool_id = $${params.length}`);
  }
  if (args.projectId) {
    params.push(args.projectId);
    where.push(`project_id = $${params.length}`);
  }
  if (args.kind) {
    if (!(SPEC_SHEET_KIND_VALUES as readonly string[]).includes(args.kind)) {
      throw new Error(`Invalid kind: ${args.kind}`);
    }
    params.push(args.kind);
    where.push(`kind = $${params.length}`);
  }
  if (args.tag && args.tag.trim()) {
    params.push(args.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  const r = await pool.query(
    `SELECT ${SPEC_SHEET_COLUMNS}
       FROM agos_maker_spec_sheets
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC`,
    params,
  );
  return r.rows.map(rowToSpecSheet);
}

export async function getSpecSheet(
  id: string,
  userId: string,
): Promise<SpecSheet | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${SPEC_SHEET_COLUMNS}
       FROM agos_maker_spec_sheets
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSpecSheet(r.rows[0]);
}

export async function createSpecSheet(
  userId: string,
  data: SpecSheetUpsert,
): Promise<SpecSheet> {
  const kind: SpecSheetKind = data.kind ?? 'datasheet';
  if (!(SPEC_SHEET_KIND_VALUES as readonly string[]).includes(kind)) {
    throw new Error(`Invalid kind: ${kind}`);
  }
  const attachErr = validateAttachmentExclusivity({
    partId: data.partId ?? null,
    toolId: data.toolId ?? null,
    projectId: data.projectId ?? null,
  });
  if (attachErr) throw new Error(attachErr);

  // Cross-ownership: if attaching to a part or a tool, the part/tool must
  // belong to this user. project_id is per-OS UUID and not FK-checked.
  if (data.partId) {
    const part = await getCatalogRow(data.partId, userId);
    if (!part) throw new Error('Part not found or not owned by user');
  }
  if (data.toolId) {
    const tool = await getTool(data.toolId, userId);
    if (!tool) throw new Error('Tool not found or not owned by user');
  }

  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_spec_sheets
       (id, user_id, title, kind, url, notes, revision, issued_at,
        part_id, tool_id, project_id, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13::jsonb)`,
    [
      id,
      userId,
      data.title,
      kind,
      data.url,
      data.notes ?? null,
      data.revision ?? null,
      data.issuedAt ?? null,
      data.partId ?? null,
      data.toolId ?? null,
      data.projectId ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const sheet = await getSpecSheet(id, userId);
  if (!sheet) throw new Error('Failed to create spec sheet');
  return sheet;
}

export async function updateSpecSheet(
  id: string,
  userId: string,
  patch: SpecSheetPatch,
): Promise<SpecSheet | null> {
  if (
    patch.kind !== undefined &&
    !(SPEC_SHEET_KIND_VALUES as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid kind: ${patch.kind}`);
  }
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_spec_sheets
        SET title     = COALESCE($3, title),
            kind      = COALESCE($4, kind),
            url       = COALESCE($5, url),
            notes     = COALESCE($6, notes),
            revision  = COALESCE($7, revision),
            issued_at = COALESCE($8, issued_at),
            tags      = COALESCE($9::text[], tags),
            metadata  = COALESCE($10::jsonb, metadata),
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.kind ?? null,
      patch.url ?? null,
      patch.notes ?? null,
      patch.revision ?? null,
      patch.issuedAt ?? null,
      patch.tags ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getSpecSheet(id, userId);
}

export async function deleteSpecSheet(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_spec_sheets WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Spec sheets gathered for a project's Specs tab. The union covers:
 *   - sheets attached directly to the project,
 *   - sheets attached to any catalog part referenced from the project's BOM,
 *   - sheets attached to any tool linked via project_tools.
 *
 * All three queries are scoped to the user, so cross-tenant leakage is not
 * possible. Returned in a single flat list ordered by attachment kind then
 * title — the UI groups them client-side.
 */
export async function listSpecSheetsForProject(
  projectId: string,
  userId: string,
): Promise<SpecSheet[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `WITH bom_parts AS (
       SELECT DISTINCT part_catalog_id AS pid
         FROM agos_maker_bom_lines
        WHERE project_id = $1
     ),
     project_tool_ids AS (
       SELECT DISTINCT tool_id AS tid
         FROM agos_maker_project_tools
        WHERE project_id = $1
     )
     SELECT ${SPEC_SHEET_COLUMNS}
       FROM agos_maker_spec_sheets s
      WHERE s.user_id = $2
        AND (
              s.project_id = $1
           OR s.part_id IN (SELECT pid FROM bom_parts)
           OR s.tool_id IN (SELECT tid FROM project_tool_ids)
        )
      ORDER BY
        CASE WHEN s.project_id IS NOT NULL THEN 0
             WHEN s.part_id    IS NOT NULL THEN 1
             ELSE 2
        END ASC,
        s.title ASC`,
    [projectId, userId],
  );
  return r.rows.map(rowToSpecSheet);
}

// ═══════════════════════════════════════════════════════════════════════════
// References library (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

const REFERENCE_COLUMNS = `id, user_id, title, kind, url, authors, publisher,
                           published_at, notes, tags, metadata,
                           created_at, updated_at`;

function rowToReference(row: any): Reference {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    kind: (row.kind as ReferenceKind) ?? 'link',
    url: row.url,
    authors: row.authors ?? null,
    publisher: row.publisher ?? null,
    publishedAt: row.published_at
      ? row.published_at instanceof Date
        ? row.published_at.toISOString().slice(0, 10)
        : String(row.published_at).slice(0, 10)
      : null,
    notes: row.notes ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export interface ListReferencesArgs {
  userId: string;
  kind?: ReferenceKind;
  tag?: string;
}

export async function listReferences(args: ListReferencesArgs): Promise<Reference[]> {
  const pool = getMakerPool();
  const params: any[] = [args.userId];
  const where: string[] = ['user_id = $1'];
  if (args.kind) {
    if (!(REFERENCE_KIND_VALUES as readonly string[]).includes(args.kind)) {
      throw new Error(`Invalid kind: ${args.kind}`);
    }
    params.push(args.kind);
    where.push(`kind = $${params.length}`);
  }
  if (args.tag && args.tag.trim()) {
    params.push(args.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }
  const r = await pool.query(
    `SELECT ${REFERENCE_COLUMNS}
       FROM agos_maker_references
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC`,
    params,
  );
  return r.rows.map(rowToReference);
}

export async function getReference(
  id: string,
  userId: string,
): Promise<Reference | null> {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT ${REFERENCE_COLUMNS}
       FROM agos_maker_references
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToReference(r.rows[0]);
}

export async function createReference(
  userId: string,
  data: ReferenceUpsert,
): Promise<Reference> {
  const kind: ReferenceKind = data.kind ?? 'link';
  if (!(REFERENCE_KIND_VALUES as readonly string[]).includes(kind)) {
    throw new Error(`Invalid kind: ${kind}`);
  }
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_references
       (id, user_id, title, kind, url, authors, publisher, published_at,
        notes, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::jsonb)`,
    [
      id,
      userId,
      data.title,
      kind,
      data.url,
      data.authors ?? null,
      data.publisher ?? null,
      data.publishedAt ?? null,
      data.notes ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const ref = await getReference(id, userId);
  if (!ref) throw new Error('Failed to create reference');
  return ref;
}

export async function updateReference(
  id: string,
  userId: string,
  patch: ReferencePatch,
): Promise<Reference | null> {
  if (
    patch.kind !== undefined &&
    !(REFERENCE_KIND_VALUES as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid kind: ${patch.kind}`);
  }
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_references
        SET title        = COALESCE($3, title),
            kind         = COALESCE($4, kind),
            url          = COALESCE($5, url),
            authors      = COALESCE($6, authors),
            publisher    = COALESCE($7, publisher),
            published_at = COALESCE($8, published_at),
            notes        = COALESCE($9, notes),
            tags         = COALESCE($10::text[], tags),
            metadata     = COALESCE($11::jsonb, metadata),
            updated_at   = now()
      WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.kind ?? null,
      patch.url ?? null,
      patch.authors ?? null,
      patch.publisher ?? null,
      patch.publishedAt ?? null,
      patch.notes ?? null,
      patch.tags ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return getReference(id, userId);
}

export async function deleteReference(id: string, userId: string): Promise<boolean> {
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_references WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function assertReferenceOwnership(
  referenceId: string,
  userId: string,
): Promise<void> {
  const ref = await getReference(referenceId, userId);
  if (!ref) throw new Error('Reference not found or not owned by user');
}

// ═══════════════════════════════════════════════════════════════════════════
// Project↔reference join (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

function rowToProjectReferenceLink(row: any): ProjectReferenceLink {
  return {
    id: row.id,
    projectId: row.project_id,
    referenceId: row.reference_id,
    notes: row.notes ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * List references linked to a project as a joined view. Cross-ownership
 * filter: only references owned by the requesting user are returned, so
 * stale links to references transferred to another user are filtered out.
 */
export async function listReferencesForProject(
  projectId: string,
  userId: string,
): Promise<ProjectReferenceJoined[]> {
  await assertProjectOwnership(projectId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT pr.id, pr.project_id, pr.reference_id, pr.notes, pr.created_at,
            r.title       AS reference_title,
            r.kind        AS reference_kind,
            r.url         AS reference_url,
            r.authors     AS reference_authors,
            r.publisher   AS reference_publisher,
            r.published_at AS reference_published_at,
            r.tags        AS reference_tags
       FROM agos_maker_project_references pr
       JOIN agos_maker_references r ON r.id = pr.reference_id
      WHERE pr.project_id = $1
        AND r.user_id = $2
      ORDER BY pr.created_at DESC`,
    [projectId, userId],
  );
  return r.rows.map((row: any) => ({
    ...rowToProjectReferenceLink(row),
    referenceTitle: row.reference_title,
    referenceKind: row.reference_kind as ReferenceKind,
    referenceUrl: row.reference_url,
    referenceAuthors: row.reference_authors ?? null,
    referencePublisher: row.reference_publisher ?? null,
    referencePublishedAt: row.reference_published_at
      ? row.reference_published_at instanceof Date
        ? row.reference_published_at.toISOString().slice(0, 10)
        : String(row.reference_published_at).slice(0, 10)
      : null,
    referenceTags: Array.isArray(row.reference_tags) ? row.reference_tags : [],
  }));
}

/**
 * Attach a reference to a project. The reference must be owned by the user.
 * Duplicate (project_id, reference_id) attaches throw a unique-constraint
 * error which the route maps to 409.
 */
export async function attachReferenceToProject(
  projectId: string,
  referenceId: string,
  userId: string,
  options: { notes?: string | null } = {},
): Promise<ProjectReferenceLink> {
  await assertProjectOwnership(projectId, userId);
  await assertReferenceOwnership(referenceId, userId);
  const pool = getMakerPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_maker_project_references
       (id, project_id, reference_id, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, projectId, referenceId, options.notes ?? null],
  );
  return {
    id,
    projectId,
    referenceId,
    notes: options.notes ?? null,
    createdAt: new Date().toISOString(),
  };
}

export async function updateProjectReferenceLink(
  projectId: string,
  referenceId: string,
  userId: string,
  patch: ProjectReferenceLinkPatch,
): Promise<ProjectReferenceLink | null> {
  await assertProjectOwnership(projectId, userId);
  await assertReferenceOwnership(referenceId, userId);
  const pool = getMakerPool();
  await pool.query(
    `UPDATE agos_maker_project_references
        SET notes = COALESCE($3, notes)
      WHERE project_id = $1 AND reference_id = $2`,
    [projectId, referenceId, patch.notes ?? null],
  );
  const r = await pool.query(
    `SELECT id, project_id, reference_id, notes, created_at
       FROM agos_maker_project_references
      WHERE project_id = $1 AND reference_id = $2`,
    [projectId, referenceId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProjectReferenceLink(r.rows[0]);
}

export async function detachReferenceFromProject(
  projectId: string,
  referenceId: string,
  userId: string,
): Promise<boolean> {
  await assertProjectOwnership(projectId, userId);
  await assertReferenceOwnership(referenceId, userId);
  const pool = getMakerPool();
  const r = await pool.query(
    `DELETE FROM agos_maker_project_references
      WHERE project_id = $1 AND reference_id = $2`,
    [projectId, referenceId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════════════════

interface LegacyRecordAuditArgs {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string | null;
}

/** Slug-parameterized audit writer. The `osSlug` is locked to `'maker'`. */
export async function recordAudit(
  args: LegacyRecordAuditArgs | Omit<RecordAuditArgs, 'pool' | 'osSlug'>,
): Promise<void> {
  const pool = getMakerPool();
  await sharedRecordAudit({
    pool,
    osSlug: 'maker',
    actorId: args.actorId,
    action: args.action,
    payload: args.payload,
    projectId: args.projectId ?? null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Legacy aliases (soft-deprecated; remove in Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated — use `MakerProject` from `./projects.ts`. */
export type Build = MakerProject;

/** @deprecated — use `MakerProject` from `./projects.ts`. */
export type BuildProject = MakerProject;

/** @deprecated — use `CreateMakerProjectInput`. */
export type BuildUpsert = CreateMakerProjectInput;

/** @deprecated — use `listProjects`. */
export const listBuilds = listProjects;

/** @deprecated — use `getProject`. */
export const getBuild = getProject;

/** @deprecated — use `createProject`. */
export const createBuild = createProject;

/** @deprecated — use `updateProject`. */
export const updateBuild = updateProject;

/** @deprecated — use `deleteProject`. */
export const deleteBuild = deleteProject;
