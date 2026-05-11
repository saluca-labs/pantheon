import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
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
// Health OS and Cyber OS are excluded — they have dedicated hub pages
// (`/dashboard/os/health/page.tsx` with risk flags + consent gate;
// `/dashboard/os/cyber/page.tsx` with stats + recent panels). Listing
// either here would create a route collision.
const HUB_SLUGS = new Set(['health', 'cyber']);
export function generateStaticParams() {
  return AGENTIC_OS_MODULES.filter((m) => !HUB_SLUGS.has(m.slug)).map((m) => ({
    slug: m.slug,
  }));
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
  const hasFeatures = mod.features.length > 0;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All Agentic OS modules
      </Link>

      {/* Compact metadata header — icon, name, status, tagline, description. */}
      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-[#0f1117] p-2.5 border border-[#2a2d3e]">
            <Icon className="w-6 h-6 text-[#4361EE]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">{mod.label}</h1>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-[#94a3b8] text-sm">{mod.tagline}</p>
            <p className="text-sm text-[#cbd5e1]/80 mt-2 leading-relaxed">
              {mod.description}
            </p>
          </div>
        </div>
      </header>

      {/* Primary content: feature grid. */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Features</h2>
          {hasFeatures && (
            <span className="text-xs text-[#94a3b8]">
              {mod.features.length}{' '}
              {mod.features.length === 1 ? 'feature' : 'features'} available
            </span>
          )}
        </div>

        {hasFeatures ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mod.features.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 hover:border-[#4361EE]/60 hover:bg-[#1f2230] transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold text-white mb-1">
                    {feature.label}
                  </div>
                  <p className="text-sm text-[#94a3b8] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] mt-1 shrink-0 transition" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-6 text-center">
            <p className="text-sm font-medium text-white mb-1">Coming soon</p>
            <p className="text-xs text-[#94a3b8]">
              {mod.status === 'preview'
                ? 'Schema and plan are live. Feature pages roll out in the parallel rollout phase.'
                : 'Feature pages for this module have not shipped yet.'}{' '}
              Track progress in the execution roadmap below.
            </p>
          </div>
        )}
      </section>

      {/* Secondary content: collapsed execution roadmap. */}
      <details className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27]">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-4 text-sm text-[#cbd5e1] hover:text-white transition">
          <span className="flex items-center gap-2">
            <ChevronDown className="w-4 h-4 text-[#94a3b8] transition group-open:rotate-180" />
            <span className="font-medium">View execution roadmap</span>
            <span className="text-xs text-[#94a3b8]">(full plan markdown)</span>
          </span>
        </summary>
        <div className="px-6 pb-6 pt-2 border-t border-[#2a2d3e]">
          {plan ? (
            <PlanViewer markdown={plan} />
          ) : (
            <p className="text-[#94a3b8] text-sm">
              Execution plan not available for this module yet.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
