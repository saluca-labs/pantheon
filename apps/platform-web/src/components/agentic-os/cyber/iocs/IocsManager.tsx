'use client';

/**
 * CyberSec OS — IOC catalog list + filters + create.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Ioc, IocKind, ThreatType } from '@/lib/agentic-os/cyber/iocs';
import { IOC_KINDS, THREAT_TYPES } from '@/lib/agentic-os/cyber/iocs';
import { IocCard } from './IocCard';
import { IocForm } from './IocForm';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function IocsManager({ initialIocs }: { initialIocs: Ioc[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<IocKind | ''>('');
  const [threatType, setThreatType] = useState<ThreatType | ''>('');
  const [search, setSearch] = useState('');

  const filtered = initialIocs.filter((i) => {
    if (kind && i.kind !== kind) return false;
    if (threatType && i.threatType !== threatType) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !i.value.toLowerCase().includes(q) &&
        !((i.title ?? '').toLowerCase().includes(q)) &&
        !((i.description ?? '').toLowerCase().includes(q)) &&
        !i.tags.some((t) => t.toLowerCase().includes(q))
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Value, title, tag…" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as IocKind | '')} className={inputCls}>
            <option value="">All</option>
            {IOC_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Threat</span>
          <select value={threatType} onChange={(e) => setThreatType(e.target.value as ThreatType | '')} className={inputCls}>
            <option value="">All</option>
            {THREAT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'Add IOC'}
        </button>
      </div>

      {creating && (
        <IocForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No IOCs match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((i) => (
            <IocCard key={i.id} ioc={i} />
          ))}
        </div>
      )}
    </div>
  );
}
