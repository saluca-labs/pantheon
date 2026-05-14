/**
 * Generic compact list-of-rows component shared across Agentic OS
 * surfaces. Renders a simple table with a header row, a body, and an
 * optional empty state. The two Phase 2 callers (mood entries, journal
 * entries) use this so the visual treatment stays consistent across
 * the OS shell.
 *
 * Designed to be a server component — no event handlers — so it can be
 * embedded directly inside server-rendered pages without a client/server
 * boundary cost.
 */

import type { ReactNode } from 'react';

export interface DataTableColumn<TRow> {
  /** Column header copy. */
  label: string;
  /** Cell renderer. Returns ReactNode (string allowed). */
  render: (row: TRow) => ReactNode;
  /** Tailwind classes for the <td>. */
  cellClassName?: string;
  /** Hide on small screens (use `hidden sm:table-cell` etc). */
  className?: string;
}

export interface DataTableProps<TRow> {
  rows: TRow[];
  columns: DataTableColumn<TRow>[];
  /** Stable key extractor; defaults to row.id when present. */
  rowKey?: (row: TRow) => string;
  /** Empty-state node (string or JSX). */
  empty?: ReactNode;
  /** Wrap each row in a clickable link. Returns null for non-clickable. */
  rowHref?: (row: TRow) => string | null;
}

function defaultKey<TRow>(row: TRow, idx: number): string {
  if (row && typeof row === 'object' && 'id' in row) {
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return String(idx);
}

export function DataTable<TRow>({
  rows,
  columns,
  rowKey,
  empty,
  rowHref,
}: DataTableProps<TRow>) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-text-secondary">
        {empty ?? 'No entries yet.'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
            {columns.map((col) => (
              <th
                key={col.label}
                className={`py-2 pr-4 font-normal ${col.className ?? ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const key = rowKey ? rowKey(row) : defaultKey(row, idx);
            const href = rowHref ? rowHref(row) : null;
            return (
              <tr
                key={key}
                className="border-t border-border-subtle hover:bg-surface-1 transition"
              >
                {columns.map((col, ci) => (
                  <td
                    key={`${key}-${ci}`}
                    className={`py-2 pr-4 text-text-primary ${col.cellClassName ?? ''} ${
                      col.className ?? ''
                    }`}
                  >
                    {href && ci === 0 ? (
                      <a
                        href={href}
                        className="hover:text-white transition block"
                      >
                        {col.render(row)}
                      </a>
                    ) : (
                      col.render(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
