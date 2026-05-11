/**
 * Filmmaker OS — Project Hub.
 *
 * The per-project landing page that every later phase (script, schedule,
 * dailies, edit notes, distribution) attaches to. Shows the cover header,
 * phase tracker, stats row, and a link into the shot list.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, CalendarDays, Clapperboard, Film, FileText, Layers, Link2, ScrollText, Users, UserSquare2 } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProjectWithStats } from '@/lib/agentic-os/filmmaker/repo';
import {
  PROJECT_STATUS_LABELS,
  FORMAT_LABELS,
  type ProjectStatus,
} from '@/lib/agentic-os/filmmaker/projects';
import { PhaseProgressEditor } from '@/components/agentic-os/filmmaker/phase-progress-editor';
import { ProjectHubActions } from '@/components/agentic-os/filmmaker/project-hub-actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  pre_production: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  production: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  post_production: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  wrapped: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  archived: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
};

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

function formatMinutes(seconds: number): string {
  if (seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function FilmmakerProjectHubPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProjectWithStats(id, user.userId);
  if (!project) notFound();

  const countdown = daysUntil(project.targetCompletionDate);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/filmmaker/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to projects
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden mb-6">
        {project.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.coverImageUrl}
            alt={project.name}
            className="w-full h-48 object-cover border-b border-[#2a2d3e]"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-[#4361EE]/20 to-[#1a1d27] border-b border-[#2a2d3e] flex items-center justify-center">
            <Clapperboard className="w-10 h-10 text-[#4361EE]/50" />
          </div>
        )}

        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1]">
                {FORMAT_LABELS[project.format]}
              </span>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[project.status]}`}
              >
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
            </div>
            {project.logline && (
              <p className="text-sm text-white/90 italic mb-2">{project.logline}</p>
            )}
            {project.description && (
              <p className="text-sm text-[#94a3b8]">{project.description}</p>
            )}
            {project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ProjectHubActions project={project} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phase tracker */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Phase progress
          </h2>
          <PhaseProgressEditor projectId={project.id} initial={project.phaseProgress} />
        </div>

        {/* Stats + shots link */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Stats
            </h2>
            <StatRow
              icon={<Film className="w-4 h-4" />}
              label="Shots"
              value={`${project.completedShotCount} / ${project.shotCount}`}
            />
            <StatRow
              icon={<Clapperboard className="w-4 h-4" />}
              label="Est. runtime"
              value={formatMinutes(project.totalEstimatedSeconds)}
            />
            <StatRow
              icon={<Users className="w-4 h-4" />}
              label="Team size"
              value={project.teamSize == null ? '—' : String(project.teamSize)}
            />
            <StatRow
              icon={<Calendar className="w-4 h-4" />}
              label="Target completion"
              value={
                project.targetCompletionDate
                  ? `${project.targetCompletionDate}${
                      countdown == null
                        ? ''
                        : countdown >= 0
                          ? ` (in ${countdown}d)`
                          : ` (${Math.abs(countdown)}d ago)`
                    }`
                  : '—'
              }
            />
          </div>

          <Link
            href={`/dashboard/os/filmmaker/shots?projectId=${project.id}`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div>
              <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                Shot list
              </p>
              <p className="text-xs text-[#94a3b8] mt-0.5">
                {project.shotCount === 0
                  ? 'No shots yet — start the breakdown.'
                  : `${project.shotCount} shots, ${project.completedShotCount} done.`}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/story`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <ScrollText className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Story
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Bible, treatment, logline, outline, pitch deck.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/screenplay`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Screenplay
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Fountain editor — scenes, characters, version history.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/characters`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <UserSquare2 className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Characters
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Character sheets — identity, psychology, voice.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/relationships`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <Link2 className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Relationships
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Who knows whom — kinds, direction, tension.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/breakdown`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <Layers className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Breakdown
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Tag scenes with cast, props, vehicles, costume, fx.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>

          <Link
            href={`/dashboard/os/filmmaker/projects/${project.id}/schedule`}
            className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
          >
            <div className="flex items-start gap-3">
              <CalendarDays className="w-4 h-4 text-[#94a3b8] mt-0.5 group-hover:text-[#4361EE] transition" />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition">
                  Schedule
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Stripboard — drop scenes onto shooting days.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-2 text-[#94a3b8]">
        {icon}
        {label}
      </span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
