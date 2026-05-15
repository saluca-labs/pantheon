'use client';

/**
 * Research OS — ExperimentCard.
 *
 * List card used by the experiments hub grid. Shows cover image, name,
 * status pill, target-date pill, tag pills, and the phase-avg progress bar.
 * Mirrors Maker's project-card UX.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import Link from 'next/link';
import { FlaskConical, Calendar } from 'lucide-react';
import {
  EXPERIMENT_STATUS_LABELS,
  experimentPhaseAvg,
  type ExperimentPhase,
  type ExperimentStatus,
} from '@/lib/agentic-os/research/experiments';

export const STATUS_COLOR: Record<ExperimentStatus, string> = {
  planning: 'text-accent bg-accent/10 border-accent/30',
  running: 'text-warning bg-warning/10 border-warning/30',
  analysis: 'text-accent bg-accent/10 border-accent/30',
  writeup: 'text-os-research bg-os-research/10 border-os-research/30',
  published: 'text-positive bg-positive/10 border-positive/30',
  archived: 'text-text-secondary bg-surface-2 border-border-subtle',
};

export interface ExperimentCardData {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  teamSize: number | null;
  phaseProgress: Record<ExperimentPhase, number>;
}

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

export function ExperimentCard({ experiment }: { experiment: ExperimentCardData }) {
  const avg = experimentPhaseAvg(experiment.phaseProgress);
  const countdown = daysUntil(experiment.targetCompletionDate);

  return (
    <Link
      href={`/dashboard/os/research/experiments/${experiment.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 overflow-hidden hover:border-accent/60 transition group"
    >
      <div className="flex">
        {experiment.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={experiment.coverImageUrl}
            alt=""
            className="w-32 h-32 object-cover border-r border-border-subtle shrink-0"
          />
        ) : (
          <div className="w-32 h-32 shrink-0 border-r border-border-subtle bg-gradient-to-br from-accent/15 to-surface-2 flex items-center justify-center">
            <FlaskConical className="w-8 h-8 text-accent/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-accent transition truncate">
              {experiment.name}
            </h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[experiment.status]}`}
            >
              {EXPERIMENT_STATUS_LABELS[experiment.status]}
            </span>
            {experiment.targetCompletionDate && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border-subtle bg-surface-0 text-text-primary inline-flex items-center gap-1"
                title={`Target ${experiment.targetCompletionDate}`}
              >
                <Calendar className="w-3 h-3" />
                {countdown == null
                  ? experiment.targetCompletionDate
                  : countdown >= 0
                    ? `${countdown}d`
                    : `${Math.abs(countdown)}d ago`}
              </span>
            )}
          </div>
          {experiment.description && (
            <p className="text-xs text-text-secondary truncate">{experiment.description}</p>
          )}
          {experiment.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {experiment.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
              {experiment.tags.length > 4 && (
                <span className="text-[10px] text-text-secondary">+{experiment.tags.length - 4}</span>
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
  );
}
