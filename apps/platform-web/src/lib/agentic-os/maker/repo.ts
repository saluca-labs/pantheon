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
