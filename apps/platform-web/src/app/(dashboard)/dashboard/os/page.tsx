import Link from 'next/link';
import { Cpu } from 'lucide-react';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

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

export default function AgenticOsIndexPage() {
  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-2">
        <Cpu className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Agentic OS</h1>
      </div>
      <p className="text-[#94a3b8] mb-8">
        Vertical operating systems for life and work — each with its own data
        model, plan generator, and citation-backed agent loop.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTIC_OS_MODULES.map((mod) => {
          const Icon = mod.icon;
          const badge = STATUS_BADGE[mod.status] ?? STATUS_BADGE['planned']!;
          return (
            <Link
              key={mod.slug}
              href={`/dashboard/os/${mod.slug}`}
              className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 transition hover:border-[#4361EE]/60 hover:bg-[#1f2230]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-[#0f1117] p-2 border border-[#2a2d3e]">
                    <Icon className="w-5 h-5 text-[#4361EE]" />
                  </div>
                  <h2 className="text-white font-semibold group-hover:text-[#4361EE] transition">
                    {mod.label}
                  </h2>
                </div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-sm text-[#94a3b8] mb-2">{mod.tagline}</p>
              <p className="text-xs text-[#94a3b8]/70 leading-relaxed">
                {mod.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
