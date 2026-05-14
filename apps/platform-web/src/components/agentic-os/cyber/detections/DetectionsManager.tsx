'use client';

/**
 * CyberSec OS — Detection rules list with filters + create-rule toggle.
 *
 * Mirrors CasesManager from Phase 2.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type {
  DetectionLifecycle,
  DetectionRule,
  DetectionSeverity,
} from '@/lib/agentic-os/cyber/detections';
import {
  DETECTION_LIFECYCLES,
  DETECTION_SEVERITIES,
} from '@/lib/agentic-os/cyber/detections';
import { DetectionRuleCard } from './DetectionRuleCard';
import { DetectionRuleForm } from './DetectionRuleForm';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function DetectionsManager({ initialRules }: { initialRules: DetectionRule[] }) {
  const [creating, setCreating] = useState(false);
  const [lifecycle, setLifecycle] = useState<DetectionLifecycle | ''>('');
  const [severity, setSeverity] = useState<DetectionSeverity | ''>('');
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
        <label className="block min-w-[180px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, description, author, tag…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Lifecycle</span>
          <select
            value={lifecycle}
            onChange={(e) => setLifecycle(e.target.value as DetectionLifecycle | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {DETECTION_LIFECYCLES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as DetectionSeverity | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {DETECTION_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New rule'}
        </button>
      </div>

      {creating && (
        <DetectionRuleForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No detection rules match the current filters.
        </p>
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
