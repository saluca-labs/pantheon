'use client';

/**
 * CyberSec OS — Detection rules list with filters + create-rule toggle.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus, Radar } from 'lucide-react';
import type {
  DetectionLifecycle,
  DetectionRule,
  DetectionSeverity,
} from '@/lib/agentic-os/cyber/detections';
import {
  DETECTION_LIFECYCLES,
  DETECTION_SEVERITIES,
} from '@/lib/agentic-os/cyber/detections';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { DetectionRuleCard } from './DetectionRuleCard';
import { DetectionRuleForm } from './DetectionRuleForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function DetectionsManager({ initialRules }: { initialRules: DetectionRule[] }) {
  const [creating, setCreating] = useState(false);
  const [lifecycle, setLifecycle] = useState<DetectionLifecycle | ''>('');
  const [severity, setSeverity] = useState<DetectionSeverity | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setLifecycle((q.lifecycle ?? '') as DetectionLifecycle | '');
    setSeverity((q.severity ?? '') as DetectionSeverity | '');
  }

  const filtered = initialRules.filter((r) => {
    if (lifecycle && r.lifecycle !== lifecycle) return false;
    if (severity && r.severity !== severity) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !r.name.toLowerCase().includes(q) &&
        !((r.description ?? '').toLowerCase().includes(q)) &&
        !((r.author ?? '').toLowerCase().includes(q)) &&
        !r.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const hasFilters =
    search.trim().length > 0 || lifecycle !== '' || severity !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Name, description, author, tag…"
        filters={{ lifecycle, severity }}
        onApplyQuery={applyQuery}
        savedViewKey="detections"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Lifecycle
              </span>
              <select
                value={lifecycle}
                onChange={(e) =>
                  setLifecycle(e.target.value as DetectionLifecycle | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {DETECTION_LIFECYCLES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Severity
              </span>
              <select
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as DetectionSeverity | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {DETECTION_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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
            {creating ? 'Close' : 'New rule'}
          </button>
        }
      />

      {creating && (
        <DetectionRuleForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No detection rules match these filters'
              : 'No detection rules yet'
          }
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more rules.'
              : 'Author Sigma-style detection rules to test, lifecycle, and feed the alert pipeline.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New rule',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <DetectionRuleCard key={r.id} rule={r} />
          ))}
        </div>
      )}
    </div>
  );
}
