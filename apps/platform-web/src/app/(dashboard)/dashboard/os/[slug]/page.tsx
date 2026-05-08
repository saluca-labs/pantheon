import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  AGENTIC_OS_MODULES,
  findAgenticOsModule,
} from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { PlanViewer } from '@/components/agentic-os/plan-viewer';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  preview: {
    label: 'Preview',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  planned: {
    label: 'Planned',
    className: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  },
};

// Generate the static slug list at build time so Next can prerender.
export function generateStaticParams() {
  return AGENTIC_OS_MODULES.map((m) => ({ slug: m.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AgenticOsModulePage({ params }: Props) {
  const { slug } = await params;
  const mod = findAgenticOsModule(slug);
  if (!mod) {
    notFound();
  }

  const plan = await loadAgenticOsPlan(slug);
  const Icon = mod.icon;
  const badge = STATUS_BADGE[mod.status] ?? STATUS_BADGE['planned']!;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All Agentic OS modules
      </Link>

      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-[#0f1117] p-3 border border-[#2a2d3e]">
              <Icon className="w-7 h-7 text-[#4361EE]" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-semibold text-white">
                  {mod.label}
                </h1>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-[#94a3b8]">{mod.tagline}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-[#cbd5e1]/80 mt-4 leading-relaxed">
          {mod.description}
        </p>

        {mod.status === 'live' && mod.slug === 'health' && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link
              href="/dashboard/os/health/intake"
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 text-sm text-white hover:border-[#4361EE]/60 transition"
            >
              Intake & profile
            </Link>
            <Link
              href="/dashboard/os/health/screeners"
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 text-sm text-white hover:border-[#4361EE]/60 transition"
            >
              Screeners (PHQ-9 / GAD-7)
            </Link>
            <Link
              href="/dashboard/os/health/plan"
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 text-sm text-white hover:border-[#4361EE]/60 transition"
            >
              Plan generator
            </Link>
          </div>
        )}

        {mod.status === 'preview' && (
          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200/90">
            Schema and plan are live. Feature pages roll out in the parallel
            rollout phase — track progress in the linked execution plan below.
          </div>
        )}
      </header>

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Execution plan
        </h2>
        {plan ? (
          <PlanViewer markdown={plan} />
        ) : (
          <p className="text-[#94a3b8] text-sm">
            Execution plan not available for this module yet.
          </p>
        )}
      </section>
    </div>
  );
}
