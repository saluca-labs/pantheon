/**
 * Maker OS — Catalog row detail page.
 *
 * Loads the row, its variants, supplier links, suppliers, and the list of
 * projects whose BOM references it. All hand-off to client-side
 * `CatalogDetail` for interactive editing.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { getCurrentMakerUser, getMakerPool } from '@/lib/agentic-os/maker/session';
import {
  getCatalogRow,
  listVariants,
  listSupplierLinks,
  listSuppliers,
  listSpecSheets,
} from '@/lib/agentic-os/maker/repo';
import { CatalogDetail } from '@/components/agentic-os/maker/catalog-detail';
import { SpecSheetList } from '@/components/agentic-os/maker/spec-sheet-list';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

async function loadProjectUsage(catalogId: string, userId: string) {
  const pool = getMakerPool();
  const r = await pool.query(
    `SELECT p.id, p.name, p.status, SUM(b.quantity_needed) AS qty
       FROM agos_maker_bom_lines b
       JOIN agos_maker_projects p ON p.id = b.project_id
      WHERE b.part_catalog_id = $1
        AND p.user_id = $2
      GROUP BY p.id, p.name, p.status
      ORDER BY p.updated_at DESC`,
    [catalogId, userId],
  );
  return r.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    status: row.status as string,
    quantityNeeded: Number(row.qty ?? 0),
  }));
}

export default async function MakerCatalogDetailPage({ params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const row = await getCatalogRow(id, user.userId);
  if (!row) notFound();

  const [variants, links, suppliers, usage, specSheets] = await Promise.all([
    listVariants(id, user.userId),
    listSupplierLinks(id, user.userId),
    listSuppliers(user.userId),
    loadProjectUsage(id, user.userId),
    listSpecSheets({ userId: user.userId, partId: id }),
  ]);

  return (
    <div className="space-y-6">
      <CatalogDetail
        row={row}
        initialVariants={variants}
        initialLinks={links}
        suppliers={suppliers}
        usage={usage}
      />
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 max-w-5xl">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
          Spec sheets
        </h3>
        <SpecSheetList
          scope={{ kind: 'part', partId: id }}
          initialSheets={specSheets}
        />
      </div>
    </div>
  );
}
