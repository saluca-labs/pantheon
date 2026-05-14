'use client';

/**
 * CyberSec OS — IOC catalog list + filters + create.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus, Globe } from 'lucide-react';
import type { Ioc, IocKind, ThreatType } from '@/lib/agentic-os/cyber/iocs';
import { IOC_KINDS, THREAT_TYPES } from '@/lib/agentic-os/cyber/iocs';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { IocCard } from './IocCard';
import { IocForm } from './IocForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function IocsManager({ initialIocs }: { initialIocs: Ioc[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<IocKind | ''>('');
  const [threatType, setThreatType] = useState<ThreatType | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setKind((q.kind ?? '') as IocKind | '');
    setThreatType((q.threatType ?? '') as ThreatType | '');
  }

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

  const hasFilters =
    search.trim().length > 0 || kind !== '' || threatType !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Value, title, tag…"
        filters={{ kind, threatType }}
        onApplyQuery={applyQuery}
        savedViewKey="iocs"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Kind
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as IocKind | '')}
                className={selectCls}
              >
                <option value="">All</option>
                {IOC_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Threat
              </span>
              <select
                value={threatType}
                onChange={(e) =>
                  setThreatType(e.target.value as ThreatType | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {THREAT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'Add IOC'}
          </button>
        }
      />

      {creating && (
        <IocForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title={hasFilters ? 'No IOCs match these filters' : 'No IOCs yet'}
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more indicators.'
              : 'Catalogue IPs, domains, hashes, and URLs so trends can match them against incoming alerts.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'Add IOC',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
        />
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
