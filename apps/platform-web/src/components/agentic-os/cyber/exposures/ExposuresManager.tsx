'use client';

/**
 * CyberSec OS — Exposures list + filters.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import type {
  ExposurePriority,
  ExposureStatus,
  ExposureWithRefs,
} from '@/lib/agentic-os/cyber/exposures';
import {
  EXPOSURE_PRIORITIES,
  EXPOSURE_STATUSES,
} from '@/lib/agentic-os/cyber/exposures';
import { ExposureCard } from './ExposureCard';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function ExposuresManager({ initialExposures }: { initialExposures: ExposureWithRefs[] }) {
  const [status, setStatus] = useState<ExposureStatus | ''>('');
  const [priority, setPriority] = useState<ExposurePriority | ''>('');
  const [search, setSearch] = useState('');

  const filtered = initialExposures.filter((e) => {
    if (status && e.status !== status) return false;
    if (priority && e.priority !== priority) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !e.vulnerabilityTitle.toLowerCase().includes(q) &&
        !((e.vulnerabilityCveId ?? '').toLowerCase().includes(q)) &&
        !e.assetName.toLowerCase().includes(q) &&
        !((e.assignedTo ?? '').toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <label className="block min-w-[200px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="CVE, title, asset, assignee…" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ExposureStatus | '')} className={inputCls}>
            <option value="">All</option>
            {EXPOSURE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as ExposurePriority | '')} className={inputCls}>
            <option value="">All</option>
            {EXPOSURE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No exposures match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((e) => (
            <ExposureCard key={e.id} exposure={e} />
          ))}
        </div>
      )}
    </div>
  );
}
