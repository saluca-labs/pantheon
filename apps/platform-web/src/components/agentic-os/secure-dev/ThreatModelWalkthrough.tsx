'use client';

/**
 * Secure-Dev OS — ThreatModelWalkthrough client component.
 *
 * Accepts a free-text system description, generates a STRIDE checklist
 * client-side, and then saves it to the API.
 *
 * STRIDE methodology references:
 *   - Microsoft SDL: https://www.microsoft.com/en-us/securityengineering/sdl/threatmodeling
 *   - OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling_Process
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import { useState } from 'react';
import type { StrideChecklist, StrideThreat, StrideCategory } from '@/lib/agentic-os/secure-dev/stride';
import { generateStrideChecklist, summariseChecklist } from '@/lib/agentic-os/secure-dev/stride';

const API = '/api/tiresias/agentic-os/secure-dev/threat-models';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const CATEGORY_COLORS: Record<StrideCategory, string> = {
  Spoofing:                'border-l-blue-400',
  Tampering:               'border-l-amber-400',
  Repudiation:             'border-l-orange-400',
  'Information Disclosure':'border-l-violet-400',
  'Denial of Service':     'border-l-red-400',
  'Elevation of Privilege':'border-l-rose-400',
};

const SEVERITY_BADGE: Record<string, string> = {
  high:   'text-red-300 bg-red-500/10 border-red-500/30',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

function ThreatCard({ threat }: { threat: StrideThreat }) {
  const [open, setOpen] = useState(threat.triggered);
  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-2 border-l-4 ${CATEGORY_COLORS[threat.category]} ${!threat.triggered ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary font-medium">{threat.category}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${SEVERITY_BADGE[threat.severity]}`}>
              {threat.severity}
            </span>
            {!threat.triggered && <span className="text-[10px] text-text-secondary">not detected</span>}
          </div>
          <p className="text-sm text-white mt-0.5">{threat.title}</p>
        </div>
        <span className="text-text-secondary text-xs pt-0.5">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
          <p className="text-sm text-text-secondary">{threat.description}</p>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-1.5">Mitigations</p>
            <ul className="space-y-1">
              {threat.mitigations.map((m, i) => (
                <li key={i} className="text-sm text-white flex gap-2">
                  <span className="text-emerald-400 shrink-0">✓</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <a
            href={threat.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Reference: {threat.referenceUrl}
          </a>
        </div>
      )}
    </div>
  );
}

export function ThreatModelWalkthrough() {
  const [systemName, setSystemName] = useState('');
  const [description, setDescription] = useState('');
  const [checklist, setChecklist] = useState<StrideChecklist | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim()) return;
    const cl = generateStrideChecklist(description.trim());
    setChecklist(cl);
    setSaved(false);
  }

  async function save() {
    if (!checklist) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemName: systemName.trim() || 'Unnamed system', systemDescription: description.trim(), checklist }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const summary = checklist ? summariseChecklist(checklist) : null;
  const triggeredCount = checklist?.threats.filter((t) => t.triggered).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Input form */}
      <form onSubmit={generate} className="space-y-4 rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h3 className="text-sm font-semibold text-white">Describe your system</h3>
        <p className="text-xs text-text-secondary">
          Describe what your system does, its components (APIs, databases, auth, external services, users), and
          any sensitive data it handles. The STRIDE generator will identify relevant threats.
        </p>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">System name</span>
          <input
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            placeholder="e.g. Patient portal API"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">System description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. A REST API with JWT auth, PostgreSQL database storing PII, public upload endpoint for user avatars, admin role with elevated permissions..."
            rows={5}
            className={inputCls}
            required
          />
        </label>
        <button
          type="submit"
          disabled={!description.trim()}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition"
        >
          Generate STRIDE checklist
        </button>
      </form>

      {/* Results */}
      {checklist && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 flex items-center flex-wrap gap-4">
            <p className="text-sm text-white font-medium">{triggeredCount} threats detected in your description</p>
            {summary && (
              <div className="flex gap-3">
                <span className="text-sm text-red-300">{summary.high} High</span>
                <span className="text-sm text-amber-300">{summary.medium} Medium</span>
                <span className="text-sm text-emerald-300">{summary.low} Low</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className="text-sm text-red-300">{error}</span>}
              {saved && <span className="text-sm text-emerald-300">Saved!</span>}
              <button
                onClick={save}
                disabled={saving || saved}
                className="text-xs px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-0 text-text-secondary hover:text-white disabled:opacity-40 transition"
              >
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save report'}
              </button>
            </div>
          </div>

          {/* Threat cards */}
          <div className="space-y-2">
            {checklist.threats.map((threat) => (
              <ThreatCard key={threat.id} threat={threat} />
            ))}
          </div>

          <p className="text-xs text-text-secondary">
            STRIDE methodology per{' '}
            <a href="https://www.microsoft.com/en-us/securityengineering/sdl/threatmodeling" target="_blank" rel="noopener noreferrer" className="underline">
              Microsoft SDL Threat Modeling
            </a>{' '}
            and{' '}
            <a href="https://owasp.org/www-community/Threat_Modeling_Process" target="_blank" rel="noopener noreferrer" className="underline">
              OWASP Threat Modeling Process
            </a>.
            This tool is a starting checklist — always review with a security engineer.
          </p>
        </div>
      )}
    </div>
  );
}
