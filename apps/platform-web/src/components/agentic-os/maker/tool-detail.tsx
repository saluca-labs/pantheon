'use client';

/**
 * Maker OS — ToolDetail.
 *
 * Per-tool detail view: header card with kind / status / location pills,
 * embedded ConsumableTracker, embedded MaintenanceLog, and a list of
 * projects that link to this tool.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import Link from 'next/link';
import { useState } from 'react';
import {
  TOOL_KIND_LABELS,
  TOOL_STATUS_LABELS,
  TOOL_STATUS_VALUES,
  type Tool,
  type ToolStatus,
} from '@/lib/agentic-os/maker/tools';
import type { ToolConsumable } from '@/lib/agentic-os/maker/consumables';
import type { MaintenanceEvent } from '@/lib/agentic-os/maker/maintenance';
import type { ToolProjectUsage } from '@/lib/agentic-os/maker/repo';
import { ConsumableTracker } from './consumable-tracker';
import { MaintenanceLog } from './maintenance-log';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
  down: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  retired: 'border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]',
};

interface Props {
  tool: Tool;
  initialConsumables: ToolConsumable[];
  initialMaintenance: MaintenanceEvent[];
  projectsUsing: ToolProjectUsage[];
}

export function ToolDetail({
  tool,
  initialConsumables,
  initialMaintenance,
  projectsUsing,
}: Props) {
  const [status, setStatus] = useState<ToolStatus>(tool.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: ToolStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/maker/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error(`Update failed (${r.status})`);
    } catch (err) {
      setStatus(prev);
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
        {tool.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tool.imageUrl}
            alt={tool.name}
            className="w-full h-48 object-cover border-b border-[#2a2d3e]"
          />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-2xl font-semibold text-white">{tool.name}</h1>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#0f1117] border border-[#2a2d3e] text-[#cbd5e1]">
                  {TOOL_KIND_LABELS[tool.kind]}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}
                >
                  {TOOL_STATUS_LABELS[status]}
                </span>
              </div>
              <div className="text-xs text-[#94a3b8] space-y-0.5">
                {tool.manufacturer && (
                  <div>
                    {tool.manufacturer}
                    {tool.model ? ` · ${tool.model}` : ''}
                    {tool.serial ? ` · SN ${tool.serial}` : ''}
                  </div>
                )}
                {tool.location && <div>Location: {tool.location}</div>}
                {tool.purchasedAt && <div>Purchased {tool.purchasedAt}</div>}
              </div>
              {tool.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {tool.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {tool.notes && (
                <p className="mt-3 text-sm text-[#cbd5e1] whitespace-pre-wrap">
                  {tool.notes}
                </p>
              )}

              {/* Quick links */}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {tool.datasheetUrl && (
                  <a
                    href={tool.datasheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4361EE] hover:underline"
                  >
                    Datasheet
                  </a>
                )}
                {tool.manualUrl && (
                  <a
                    href={tool.manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4361EE] hover:underline"
                  >
                    Manual
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[#94a3b8]">Status:</label>
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value as ToolStatus)}
                disabled={saving}
                className="rounded-md border border-[#2a2d3e] bg-[#0f1117] px-2 py-1 text-xs text-white"
              >
                {TOOL_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {TOOL_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>

      {/* Consumables + Maintenance side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
          <ConsumableTracker
            toolId={tool.id}
            initialConsumables={initialConsumables}
          />
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
          <MaintenanceLog
            toolId={tool.id}
            initialEvents={initialMaintenance}
          />
        </div>
      </div>

      {/* Projects using this tool */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
          Projects using this tool
        </h3>
        {projectsUsing.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">
            Not linked to any project yet. Open a project and use the Tools tab to
            attach it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {projectsUsing.map((p) => (
              <li key={p.projectId} className="flex items-center justify-between gap-3">
                <Link
                  href={`/dashboard/os/maker/projects/${p.projectId}?tab=tools`}
                  className="text-sm text-[#cbd5e1] hover:text-[#4361EE] transition"
                >
                  {p.projectName}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#94a3b8]">
                    {p.projectStatus}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                      p.required
                        ? 'border-red-500/50 text-red-300'
                        : 'border-[#2a2d3e] text-[#94a3b8]'
                    }`}
                  >
                    {p.required ? 'Required' : 'Optional'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
