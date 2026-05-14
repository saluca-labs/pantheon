'use client';

/**
 * CyberSec OS — Playbooks list with lifecycle/search filter + create toggle.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Playbook, PlaybookLifecycle } from '@/lib/agentic-os/cyber/playbooks';
import { PLAYBOOK_LIFECYCLES } from '@/lib/agentic-os/cyber/playbooks';
import { PlaybookCard } from './PlaybookCard';
import { PlaybookForm } from './PlaybookForm';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function PlaybooksManager({ initialPlaybooks }: { initialPlaybooks: Playbook[] }) {
  const [creating, setCreating] = useState(false);
  const [lifecycle, setLifecycle] = useState<PlaybookLifecycle | ''>('');
  const [search, setSearch] = useState('');

  const filtered = initialPlaybooks.filter((p) => {
    if (lifecycle && p.lifecycle !== lifecycle) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !((p.description ?? '').toLowerCase().includes(q)) &&
        !((p.category ?? '').toLowerCase().includes(q)) &&
        !p.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
        <label className="block min-w-[180px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, description, category, tag…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Lifecycle</span>
          <select
            value={lifecycle}
            onChange={(e) => setLifecycle(e.target.value as PlaybookLifecycle | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {PLAYBOOK_LIFECYCLES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New playbook'}
        </button>
      </div>

      {creating && (
        <PlaybookForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No playbooks match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <PlaybookCard key={p.id} playbook={p} />
          ))}
        </div>
      )}
    </div>
  );
}
