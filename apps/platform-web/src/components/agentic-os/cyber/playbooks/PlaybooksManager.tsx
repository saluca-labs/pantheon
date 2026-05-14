'use client';

/**
 * CyberSec OS — Playbooks list with lifecycle/search filter + create toggle.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import type { Playbook, PlaybookLifecycle } from '@/lib/agentic-os/cyber/playbooks';
import { PLAYBOOK_LIFECYCLES } from '@/lib/agentic-os/cyber/playbooks';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { PlaybookCard } from './PlaybookCard';
import { PlaybookForm } from './PlaybookForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function PlaybooksManager({ initialPlaybooks }: { initialPlaybooks: Playbook[] }) {
  const [creating, setCreating] = useState(false);
  const [lifecycle, setLifecycle] = useState<PlaybookLifecycle | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setLifecycle((q.lifecycle ?? '') as PlaybookLifecycle | '');
  }

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

  const hasFilters = search.trim().length > 0 || lifecycle !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Name, description, category, tag…"
        filters={{ lifecycle }}
        onApplyQuery={applyQuery}
        savedViewKey="playbooks"
        filterControls={
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              Lifecycle
            </span>
            <select
              value={lifecycle}
              onChange={(e) =>
                setLifecycle(e.target.value as PlaybookLifecycle | '')
              }
              className={selectCls}
            >
              <option value="">All</option>
              {PLAYBOOK_LIFECYCLES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'New playbook'}
          </button>
        }
      />

      {creating && (
        <PlaybookForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={
            hasFilters ? 'No playbooks match these filters' : 'No playbooks yet'
          }
          description={
            hasFilters
              ? 'Try a broader search or clear the lifecycle filter to see more playbooks.'
              : 'Build a response playbook with orderable steps so analysts can execute and audit each run.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New playbook',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
        />
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
