'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface CaseScopeOption {
  id: string;
  title: string;
  severity: string;
  status: string;
}

interface CaseListItem {
  id: string;
  title: string;
  severity: string;
  status: string;
}

interface CasesListResponse {
  cases?: CaseListItem[];
}

interface Props {
  value: CaseScopeOption | null;
  onChange: (value: CaseScopeOption | null) => void;
  disabled?: boolean;
}

/**
 * Search-and-pick a single case to scope a new coach conversation. Hits
 * the existing `/api/tiresias/agentic-os/cyber/cases` list with a q filter.
 * Optional — leaving it empty creates an unscoped conversation.
 */
export function CaseScopePicker({ value, onChange, disabled }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CaseScopeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    let cancelled = false;
    setLoading(true);
    const url = term
      ? `/api/tiresias/agentic-os/cyber/cases?q=${encodeURIComponent(term)}&limit=20`
      : `/api/tiresias/agentic-os/cyber/cases?limit=20`;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<CasesListResponse>) : ({ cases: [] } as CasesListResponse)))
      .then((body) => {
        if (cancelled) return;
        const cases: CaseListItem[] = Array.isArray(body?.cases) ? body.cases : [];
        setResults(
          cases.map((c) => ({
            id: c.id,
            title: c.title,
            severity: c.severity,
            status: c.status,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, open]);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Scoped to case:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 border border-danger/30 px-2.5 py-1 text-xs text-danger">
          {value.title}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="text-danger hover:text-white disabled:opacity-50"
            aria-label="Remove case scope"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Optional — search a case to scope the conversation…"
          disabled={disabled}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 pl-8 pr-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-danger disabled:opacity-50"
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border-subtle bg-surface-2 shadow-xl max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-text-secondary">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-secondary">No cases found.</div>
          )}
          {!loading &&
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQ('');
                }}
                className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-0"
              >
                <div className="font-medium text-white truncate">{c.title}</div>
                <div className="text-[10px] text-text-tertiary">
                  {c.severity} · {c.status}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
