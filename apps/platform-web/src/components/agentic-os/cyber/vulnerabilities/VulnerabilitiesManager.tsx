'use client';

/**
 * CyberSec OS — Vulnerabilities list + filters + create-vuln toggle.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import type {
  Vulnerability,
  VulnerabilitySeverity,
} from '@/lib/agentic-os/cyber/vulnerabilities';
import { VULNERABILITY_SEVERITIES } from '@/lib/agentic-os/cyber/vulnerabilities';
import { VulnerabilityCard } from './VulnerabilityCard';
import { VulnerabilityForm } from './VulnerabilityForm';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function VulnerabilitiesManager({ initialVulns }: { initialVulns: Vulnerability[] }) {
  const [creating, setCreating] = useState(false);
  const [severity, setSeverity] = useState<VulnerabilitySeverity | ''>('');
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
        <label className="block min-w-[200px] flex-1">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, CVE, product, tag…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as VulnerabilitySeverity | '')} className={inputCls}>
            <option value="">All</option>
            {VULNERABILITY_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New vulnerability'}
        </button>
      </div>

      {creating && (
        <VulnerabilityForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No vulnerabilities match the current filters.
        </p>
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
