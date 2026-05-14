'use client';

/**
 * Maker OS — ToolDetail.
 *
 * Per-tool detail view: header card with kind / status / location pills,
 * embedded ConsumableTracker, embedded MaintenanceLog, and a list of
 * projects that link to this tool.
 *
 * Wave C-3a: the three stacked related-entity sections (consumables,
 * maintenance, projects-using) are now a `CrossEntityTabs` strip with count
 * badges — behavior-preserving (this view was already a client component
 * with no route-based deep-linking, so the swap changes nothing the user
 * can bookmark). The ad-hoc "not linked to any project" `<p>` becomes the
 * `EmptyState` primitive.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import Link from 'next/link';
import { useState } from 'react';
import { Wrench } from 'lucide-react';
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
import {
  CrossEntityTabs,
  EmptyState,
} from '@/components/agentic-os/_shared/views';
import { ConsumableTracker } from './consumable-tracker';
import { MaintenanceLog } from './maintenance-log';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
  down: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  retired: 'border-border-subtle text-text-secondary bg-surface-0',
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
      <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
        {tool.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tool.imageUrl}
            alt={tool.name}
            className="w-full h-48 object-cover border-b border-border-subtle"
          />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-2xl font-semibold text-white">{tool.name}</h1>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-0 border border-border-subtle text-text-primary">
                  {TOOL_KIND_LABELS[tool.kind]}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}
                >
                  {TOOL_STATUS_LABELS[status]}
                </span>
              </div>
              <div className="text-xs text-text-secondary space-y-0.5">
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
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {tool.notes && (
                <p className="mt-3 text-sm text-text-primary whitespace-pre-wrap">
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
                    className="text-accent hover:underline"
                  >
                    Datasheet
                  </a>
                )}
                {tool.manualUrl && (
                  <a
                    href={tool.manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Manual
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">Status:</label>
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value as ToolStatus)}
                disabled={saving}
                className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white"
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

      {/* Related entities — consumables / maintenance / projects-using */}
      <CrossEntityTabs
        slug="maker"
        tabs={[
          {
            key: 'consumables',
            label: 'Consumables',
            count: initialConsumables.length,
            content: () => (
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
                <ConsumableTracker
                  toolId={tool.id}
                  initialConsumables={initialConsumables}
                />
              </div>
            ),
          },
          {
            key: 'maintenance',
            label: 'Maintenance',
            count: initialMaintenance.length,
            content: () => (
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
                <MaintenanceLog
                  toolId={tool.id}
                  initialEvents={initialMaintenance}
                />
              </div>
            ),
          },
          {
            key: 'projects',
            label: 'Projects using',
            count: projectsUsing.length,
            content: () => (
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
                {projectsUsing.length === 0 ? (
                  <EmptyState
                    variant="bare"
                    icon={<Wrench className="h-6 w-6" />}
                    title="Not linked to any project yet"
                    description="Open a project and use its Tools tab to attach this tool to a build."
                  />
                ) : (
                  <ul className="space-y-1.5">
                    {projectsUsing.map((p) => (
                      <li
                        key={p.projectId}
                        className="flex items-center justify-between gap-3"
                      >
                        <Link
                          href={`/dashboard/os/maker/projects/${p.projectId}?tab=tools`}
                          className="text-sm text-text-primary hover:text-accent transition"
                        >
                          {p.projectName}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-secondary">
                            {p.projectStatus}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                              p.required
                                ? 'border-red-500/50 text-red-300'
                                : 'border-border-subtle text-text-secondary'
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
            ),
          },
        ]}
      />
    </div>
  );
}
