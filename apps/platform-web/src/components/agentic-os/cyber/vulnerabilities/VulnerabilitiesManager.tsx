'use client';

/**
 * CyberSec OS — Vulnerabilities list + filters + create-vuln toggle.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Upload, ShieldX } from 'lucide-react';
import type {
  Vulnerability,
  VulnerabilitySeverity,
} from '@/lib/agentic-os/cyber/vulnerabilities';
import { VULNERABILITY_SEVERITIES } from '@/lib/agentic-os/cyber/vulnerabilities';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { VulnerabilityCard } from './VulnerabilityCard';
import { VulnerabilityForm } from './VulnerabilityForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function VulnerabilitiesManager({ initialVulns }: { initialVulns: Vulnerability[] }) {
  const [creating, setCreating] = useState(false);
  const [severity, setSeverity] = useState<VulnerabilitySeverity | ''>('');
  const [search, setSearch] = useState('');

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setSeverity((q.severity ?? '') as VulnerabilitySeverity | '');
  }

  const filtered = initialVulns.filter((v) => {
    if (severity && v.severity !== severity) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !v.title.toLowerCase().includes(q) &&
        !((v.cveId ?? '').toLowerCase().includes(q)) &&
        !((v.product ?? '').toLowerCase().includes(q)) &&
        !v.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const hasFilters = search.trim().length > 0 || severity !== '';

  return (
    <div className="space-y-4">
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Title, CVE, product, tag…"
        filters={{ severity }}
        onApplyQuery={applyQuery}
        savedViewKey="vulnerabilities"
        filterControls={
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              Severity
            </span>
            <select
              value={severity}
              onChange={(e) =>
                setSeverity(e.target.value as VulnerabilitySeverity | '')
              }
              className={selectCls}
            >
              <option value="">All</option>
              {VULNERABILITY_SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/os/cyber/vulnerabilities/import"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border-subtle text-white font-medium px-3 py-2 text-sm transition"
            >
              <Upload className="w-4 h-4" />
              Import Trivy / OpenVAS
            </Link>
            <button
              type="button"
              onClick={() => setCreating((c) => !c)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Close' : 'New vulnerability'}
            </button>
          </div>
        }
      />

      {creating && (
        <VulnerabilityForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldX className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No vulnerabilities match these filters'
              : 'No vulnerabilities yet'
          }
          description={
            hasFilters
              ? 'Try a broader search or clear the severity filter to see more.'
              : 'Add a CVE manually, or import a Trivy / OpenVAS scan to populate the registry.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New vulnerability',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => setCreating(true),
                }
          }
          secondaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'Import a scan',
                  href: '/dashboard/os/cyber/vulnerabilities/import',
                }
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((v) => (
            <VulnerabilityCard key={v.id} vuln={v} />
          ))}
        </div>
      )}
    </div>
  );
}
