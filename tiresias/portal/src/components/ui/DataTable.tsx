"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (row: T) => React.ReactNode;
  minWidth?: number;
  defaultWidth?: number;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  expandedRow?: (row: T) => React.ReactNode;
  emptyMessage?: string;
}

type SortDir = "asc" | "desc" | null;

// ── Component ──────────────────────────────────────────────────────────
export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 25,
  onRowClick,
  expandedRow,
  emptyMessage = "No data",
}: DataTableProps<T>) {
  // Sort state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Filter state: key → filter string
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Column widths
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth ?? 150]))
  );

  // Pagination
  const [page, setPage] = useState(0);

  // Expanded row key (uses JSON of row for identity)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Resize drag ref
  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
        if (sortDir === "desc") setSortKey(null);
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortKey, sortDir]
  );

  const handleFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }, []);

  const onResizeStart = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widths[key] ?? 150;
      dragRef.current = { key, startX, startW };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const col = columns.find((c) => c.key === dragRef.current!.key);
        const min = col?.minWidth ?? 60;
        const newW = Math.max(min, dragRef.current.startW + ev.clientX - dragRef.current.startX);
        setWidths((w) => ({ ...w, [dragRef.current!.key]: newW }));
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths, columns]
  );

  // ── Derived data ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = data;
    for (const key of Object.keys(filters)) {
      const q = filters[key]?.toLowerCase();
      if (!q) continue;
      rows = rows.filter((r) => String(r[key] ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [data, filters]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const hasFilters = columns.some((c) => c.filterable);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>

          <thead>
            {/* Header row */}
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="relative text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider select-none"
                >
                  <span
                    className={col.sortable ? "cursor-pointer inline-flex items-center gap-1" : "inline-flex items-center gap-1"}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    {col.header}
                    {col.sortable && (
                      <span className="inline-flex text-foreground-muted/60">
                        {sortKey === col.key && sortDir === "asc" && <ChevronUp className="w-3.5 h-3.5" />}
                        {sortKey === col.key && sortDir === "desc" && <ChevronDown className="w-3.5 h-3.5" />}
                        {(sortKey !== col.key || !sortDir) && <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />}
                      </span>
                    )}
                  </span>
                  {/* Resize handle */}
                  <span
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20"
                    onMouseDown={(e) => onResizeStart(col.key, e)}
                  />
                </th>
              ))}
            </tr>

            {/* Filter row */}
            {hasFilters && (
              <tr className="border-b border-white/5">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-1.5">
                    {col.filterable ? (
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters[col.key] ?? ""}
                        onChange={(e) => handleFilter(col.key, e.target.value)}
                        className="w-full h-6 px-2 rounded bg-white/5 border border-white/10 text-xs text-foreground-muted placeholder:text-foreground-muted/30 focus:outline-none focus:border-white/20"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-foreground-subtle text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {paged.map((row, i) => {
              const globalIdx = page * pageSize + i;
              const isExpanded = expandedIdx === globalIdx;
              return (
                <React.Fragment key={globalIdx}>
                  <tr
                    onClick={() => {
                      onRowClick?.(row);
                      if (expandedRow) setExpandedIdx(isExpanded ? null : globalIdx);
                    }}
                    className={[
                      "border-b border-white/5 transition-all duration-150",
                      i % 2 === 1 ? "bg-white/[0.01]" : "",
                      onRowClick || expandedRow ? "cursor-pointer hover:bg-white/[0.04]" : "hover:bg-white/[0.03]",
                    ].join(" ")}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-sm text-foreground-muted truncate">
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && expandedRow && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={columns.length} className="px-4 py-3">
                        {expandedRow(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 text-xs text-foreground-muted">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
