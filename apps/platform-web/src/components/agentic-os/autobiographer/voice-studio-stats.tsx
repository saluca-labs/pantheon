/**
 * Autobiographer OS — VoiceStudioStats (Wave D).
 *
 * Aggregate-state widget strip for the Voice Studio surface, matching
 * the dashboard rhythm the rest of the Autobiographer OS adopted in
 * Wave C. Four `DashboardWidget` tiles derive every figure from the
 * samples + profiles the page already loads — no extra API/DB calls.
 *
 * Pure / presentational.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { CheckCircle2, FileText, Layers, Mic2 } from 'lucide-react';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';

interface Props {
  totalSamples: number;
  activeSampleCount: number;
  activeSampleWordCount: number;
  profileCount: number;
  /** Version number of the active profile, or null when none is active. */
  activeProfileVersion: number | null;
}

const AUTO_SLUG = 'autobiographer' as const;

export function VoiceStudioStats({
  totalSamples,
  activeSampleCount,
  activeSampleWordCount,
  profileCount,
  activeProfileVersion,
}: Props) {
  const archived = totalSamples - activeSampleCount;
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="voice-studio-stats"
    >
      <DashboardWidget
        title="Voice samples"
        osSlug={AUTO_SLUG}
        icon={<Mic2 className="h-4 w-4" />}
        footer={archived > 0 ? `${archived} archived` : 'All samples active'}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {totalSamples}
          </span>
          <span className="text-xs text-text-secondary">
            {activeSampleCount} active
          </span>
        </div>
      </DashboardWidget>

      <DashboardWidget
        title="Active sample words"
        osSlug={AUTO_SLUG}
        icon={<FileText className="h-4 w-4" />}
        footer="Corpus the profile builder reads"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {activeSampleWordCount.toLocaleString()}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Profile versions"
        osSlug={AUTO_SLUG}
        icon={<Layers className="h-4 w-4" />}
        footer="Each build is retained"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {profileCount}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Active profile"
        osSlug={AUTO_SLUG}
        variant={activeProfileVersion !== null ? 'positive' : 'default'}
        icon={<CheckCircle2 className="h-4 w-4" />}
        footer={
          activeProfileVersion !== null
            ? 'Consumed by the chapter drafter'
            : 'Build one to unlock the drafter'
        }
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {activeProfileVersion !== null ? `v${activeProfileVersion}` : '—'}
        </span>
      </DashboardWidget>
    </div>
  );
}
