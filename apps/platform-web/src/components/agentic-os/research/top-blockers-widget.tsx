'use client';

/**
 * Research OS Phase 6 — top blockers hub widget.
 *
 * Compact 5-item widget for the Research hub. Hydrates with an SSR
 * snapshot; refreshes on focus (5-min stale clock).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { BlockerRow } from './blocker-row';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';

const API_BASE = '/api/tiresias/agentic-os/research';
const STALE_MS = 5 * 60 * 1000;

interface Props {
  initial?: BlockerItem[];
  limit?: number;
}

export function TopBlockersWidget({ initial = [], limit = 5 }: Props) {
  const [items, setItems] = useState<BlockerItem[]>(initial);
  const [loaded, setLoaded] = useState(initial.length > 0);
  const [lastFetch, setLastFetch] = useState<number>(initial.length > 0 ? Date.now() : 0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/blockers?limit=${limit}`);
      if (r.ok) {
        const { items: latest } = await r.json();
        setItems(latest ?? []);
        setLastFetch(Date.now());
      }
    } finally {
      setLoaded(true);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastFetch > STALE_MS) {
        void refresh();
      }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [lastFetch, refresh]);

  return (
    <div
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4"
      data-testid="top-blockers-widget"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          Top blockers
        </h2>
        <Link
          href="/dashboard/os/research/blockers"
          className="text-[10px] uppercase tracking-wide text-[#4361EE] hover:underline"
        >
          View all
        </Link>
      </div>
      {!loaded && <p className="text-xs text-[#94a3b8]">Loading…</p>}
      {loaded && items.length === 0 && (
        <p className="text-xs text-[#94a3b8]" data-testid="top-blockers-widget-empty">
          All clear.
        </p>
      )}
      <ul className="space-y-2">
        {items.slice(0, limit).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <BlockerRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
