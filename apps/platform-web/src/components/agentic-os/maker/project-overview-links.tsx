/**
 * Maker OS — ProjectOverviewLinks (Wave D.4).
 *
 * Surfaces a build's linked specs + parts inline on the project hub's
 * Overview tab, so the maker sees the two highest-traffic linked-entity
 * sets without paging into the BOM or Specs tabs. Each item links into its
 * canonical surface (BOM tab / Specs tab / catalog page); the dedicated
 * tabs remain the full editors — this is a read-only at-a-glance digest.
 *
 * Server-renderable (no client hooks). The project hub server component
 * loads the data — `getBomSummary` is already fetched for the Overview's
 * export-button gate, and `listSpecSheetsForProject` is the only added
 * read; both are existing repo queries, no new SQL.
 *
 * @license MIT — Tiresias Maker OS Wave D.4 (internal).
 */

import Link from 'next/link';
import { ListChecks, FileText, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import type { BomSummary } from '@/lib/agentic-os/maker/bom';
import { formatQuantity } from '@/lib/agentic-os/maker/catalog';
import {
  SPEC_SHEET_KIND_LABELS,
  type SpecSheet,
} from '@/lib/agentic-os/maker/spec-sheets';

/** How many rows of each kind to show inline before the "view all" link. */
const INLINE_CAP = 5;

interface Props {
  projectId: string;
  bomSummary: BomSummary;
  specSheets: SpecSheet[];
}

export function ProjectOverviewLinks({
  projectId,
  bomSummary,
  specSheets,
}: Props) {
  const partRows = bomSummary.rows.slice(0, INLINE_CAP);
  const partsOverflow = bomSummary.rows.length - partRows.length;
  const specs = specSheets.slice(0, INLINE_CAP);
  const specsOverflow = specSheets.length - specs.length;

  return (
    <div className="space-y-4">
      {/* Linked parts (BOM) */}
      <section
        data-testid="overview-parts"
        className="rounded-xl border border-border-subtle bg-surface-2 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white">
            <ListChecks className="h-4 w-4 text-os-maker" />
            Parts
          </h2>
          <Link
            href={`/dashboard/os/maker/projects/${projectId}?tab=bom`}
            className="text-xs text-accent hover:underline"
          >
            Open BOM
          </Link>
        </div>
        {bomSummary.rows.length === 0 ? (
          <EmptyState
            variant="bare"
            icon={<ListChecks className="h-6 w-6" />}
            title="No parts on the BOM yet"
            description="Add catalog rows to this build's Bill of Materials to track what it needs."
          />
        ) : (
          <ul className="space-y-1.5">
            {partRows.map((row) => (
              <li
                key={row.line.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Link
                  href={`/dashboard/os/maker/catalog/${row.catalog.id}`}
                  className="truncate text-text-primary transition hover:text-accent"
                >
                  {row.catalog.name}
                </Link>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="tabular-nums text-text-secondary">
                    {formatQuantity(row.needed)} needed
                  </span>
                  {row.deficit > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 tabular-nums ${
                        row.line.priority === 'critical'
                          ? 'text-red-300'
                          : 'text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {formatQuantity(row.deficit)} short
                    </span>
                  )}
                </div>
              </li>
            ))}
            {partsOverflow > 0 && (
              <li className="pt-1 text-xs text-text-secondary">
                <Link
                  href={`/dashboard/os/maker/projects/${projectId}?tab=bom`}
                  className="text-accent hover:underline"
                >
                  + {partsOverflow} more {partsOverflow === 1 ? 'part' : 'parts'}
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Linked specs */}
      <section
        data-testid="overview-specs"
        className="rounded-xl border border-border-subtle bg-surface-2 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white">
            <FileText className="h-4 w-4 text-os-maker" />
            Specs
          </h2>
          <Link
            href={`/dashboard/os/maker/projects/${projectId}?tab=specs`}
            className="text-xs text-accent hover:underline"
          >
            Open specs
          </Link>
        </div>
        {specSheets.length === 0 ? (
          <EmptyState
            variant="bare"
            icon={<FileText className="h-6 w-6" />}
            title="No spec sheets linked yet"
            description="Datasheets, drawings, and manuals attached to this build — or to its parts and tools — show up here."
          />
        ) : (
          <ul className="space-y-1.5">
            {specs.map((sheet) => (
              <li
                key={sheet.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <a
                  href={sheet.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-text-primary transition hover:text-accent"
                >
                  {sheet.title}
                </a>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-secondary">
                  {SPEC_SHEET_KIND_LABELS[sheet.kind]}
                </span>
              </li>
            ))}
            {specsOverflow > 0 && (
              <li className="pt-1 text-xs text-text-secondary">
                <Link
                  href={`/dashboard/os/maker/projects/${projectId}?tab=specs`}
                  className="text-accent hover:underline"
                >
                  + {specsOverflow} more {specsOverflow === 1 ? 'spec' : 'specs'}
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
