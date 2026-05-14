'use client';

/**
 * CyberSec OS — Exposures list + filters.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Crosshair } from 'lucide-react';
import type {
  ExposurePriority,
  ExposureStatus,
  ExposureWithRefs,
} from '@/lib/agentic-os/cyber/exposures';
import {
  EXPOSURE_PRIORITIES,
  EXPOSURE_STATUSES,
} from '@/lib/agentic-os/cyber/exposures';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { ExposureCard } from './ExposureCard';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function ExposuresManager({ initialExposures }: { initialExposures: ExposureWithRefs[] }) {
  const [status, setStatus] = useState<ExposureStatus | ''>('');
  const [priority, setPriority] = useState<ExposurePriority | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setStatus((q.status ?? '') as ExposureStatus | '');
    setPriority((q.priority ?? '') as ExposurePriority | '');
  }

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

  const hasFilters =
    search.trim().length > 0 || status !== '' || priority !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="CVE, title, asset, assignee…"
        filters={{ status, priority }}
        onApplyQuery={applyQuery}
        savedViewKey="exposures"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Status
              </span>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ExposureStatus | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {EXPOSURE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as ExposurePriority | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {EXPOSURE_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Crosshair className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No exposures match these filters'
              : 'No exposures yet'
          }
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more exposures.'
              : 'Exposures are created when a vulnerability is linked to an asset — add vulnerabilities and assets to get started.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'Go to vulnerabilities',
                  href: '/dashboard/os/cyber/vulnerabilities',
                }
          }
        />
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
