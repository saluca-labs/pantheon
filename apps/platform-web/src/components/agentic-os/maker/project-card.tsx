'use client';

/**
 * Maker OS — ProjectCard.
 *
 * List card used by the projects-manager grid. Shows cover image, name,
 * status pill, target-date pill, and the phase-avg progress bar.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import Link from 'next/link';
import { Wrench, Calendar } from 'lucide-react';
import {
  PROJECT_STATUS_LABELS,
  projectPhaseAvg,
  type MakerPhase,
  type ProjectStatus,
} from '@/lib/agentic-os/maker/projects';

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  concept: 'text-accent bg-accent/10 border-accent/30',
  design: 'text-os-research bg-os-research/10 border-os-research/30',
  procurement: 'text-accent-info bg-accent-info/10 border-accent-info/30',
  fabrication: 'text-warning bg-warning/10 border-warning/30',
  assembly: 'text-attention bg-attention/10 border-attention/30',
  commissioning: 'text-os-secure-dev bg-os-secure-dev/10 border-os-secure-dev/30',
  done: 'text-positive bg-positive/10 border-positive/30',
  archived: 'text-text-secondary bg-surface-2 border-border-subtle',
};

export interface ProjectCardData {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  teamSize: number | null;
  phaseProgress: Record<MakerPhase, number>;
}

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

export interface ProjectCardProps {
  project: ProjectCardData;
  /**
   * Wave C-3a: optional multi-select model. When `selectable` is set the card
   * renders a corner checkbox feeding the `BulkActionsBar`. The card stays a
   * navigating `Link` either way — the checkbox is additive, not a mode swap.
   */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function ProjectCard({
  project,
  selectable = false,
  selected = false,
  onToggleSelect,
}: ProjectCardProps) {
  const avg = projectPhaseAvg(project.phaseProgress);
  const countdown = daysUntil(project.targetCompletionDate);

  return (
    <div className="relative">
      {selectable && (
        // Sibling of the Link (not a child) so toggling never navigates the
        // card. Absolutely positioned over the card's top-left corner.
        <label className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-surface-0/90">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${project.name}`}
            onChange={() => onToggleSelect?.(project.id)}
            className="h-3.5 w-3.5 accent-accent"
          />
        </label>
      )}
      <Link
        href={`/dashboard/os/maker/projects/${project.id}`}
        className={`block rounded-xl border bg-surface-2 overflow-hidden transition group ${
          selected
            ? 'border-accent'
            : 'border-border-subtle hover:border-accent/60'
        }`}
      >
        <div className="flex">
        {project.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.coverImageUrl}
            alt=""
            className="w-32 h-32 object-cover border-r border-border-subtle shrink-0"
          />
        ) : (
          <div className="w-32 h-32 shrink-0 border-r border-border-subtle bg-gradient-to-br from-accent/15 to-surface-2 flex items-center justify-center">
            <Wrench className="w-8 h-8 text-accent/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-accent transition truncate">
              {project.name}
            </h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[project.status]}`}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            {project.targetCompletionDate && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border-subtle bg-surface-0 text-text-primary inline-flex items-center gap-1"
                title={`Target ${project.targetCompletionDate}`}
              >
                <Calendar className="w-3 h-3" />
                {countdown == null
                  ? project.targetCompletionDate
                  : countdown >= 0
                    ? `${countdown}d`
                    : `${Math.abs(countdown)}d ago`}
              </span>
            )}
          </div>
          {project.description && (
            <p className="text-xs text-text-secondary truncate">{project.description}</p>
          )}
          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
              {project.tags.length > 4 && (
                <span className="text-[10px] text-text-secondary">+{project.tags.length - 4}</span>
              )}
            </div>
          )}

          {/* Phase-avg bar */}
          <div>
            <div className="flex items-center justify-between mb-1 text-[10px] text-text-secondary">
              <span>Overall</span>
              <span className="text-white font-medium">{avg}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${avg}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      </Link>
    </div>
  );
}
