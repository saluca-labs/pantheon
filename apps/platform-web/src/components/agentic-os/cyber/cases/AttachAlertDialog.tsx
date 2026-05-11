'use client';

/**
 * CyberSec OS — modal for attaching an alert to a case.
 *
 * Fetches the user's recent alerts (default filter: open / investigating /
 * resolved). User picks one, click attach.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Link as LinkIcon } from 'lucide-react';
import type { Alert } from '@/lib/agentic-os/cyber/triage';

export interface AttachAlertDialogProps {
  caseId: string;
  linkedAlertIds: Set<string>;
  onClose: () => void;
}

export function AttachAlertDialog({
  caseId,
  linkedAlertIds,
  onClose,
}: AttachAlertDialogProps) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/tiresias/agentic-os/cyber/alerts', {
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`Failed to load alerts (${r.status})`);
        const { alerts: list } = await r.json();
        if (!cancelled) setAlerts(list ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function attach(alertId: string) {
    setBusy(alertId);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/alerts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attach failed');
    } finally {
      setBusy(null);
    }
  }

  const filtered = alerts
    .filter((a) =>
      ['open', 'investigating', 'resolved'].includes(a.status) &&
      !linkedAlertIds.has(a.id),
    )
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-[#2a2d3e] bg-[#0f1117] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-[#2a2d3e]">
          <h2 className="text-base font-semibold text-white inline-flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-[#4361EE]" />
            Attach alert
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94a3b8] hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-4 border-b border-[#2a2d3e]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, source, description…"
            className="w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none"
          />
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-[#94a3b8]">Loading alerts…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No matching alerts.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] text-[#cbd5e1]">
                        {a.severity}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] text-[#94a3b8]">
                        {a.status}
                      </span>
                      <span className="text-sm text-white truncate">
                        {a.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94a3b8]">
                      {a.source} · {new Date(a.occurredAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => attach(a.id)}
                    disabled={busy === a.id}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white px-2.5 py-1 text-xs transition"
                  >
                    {busy === a.id ? 'Attaching…' : 'Attach'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
        </div>
      </div>
    </div>
  );
}
