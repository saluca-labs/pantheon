import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { CbtExercise } from '@/lib/agentic-os/health/repo';

/**
 * Server-rendered grid of CBT exercise cards. Each card links to
 * `/dashboard/os/health/cbt/<kind>/new` (the wizard for that kind).
 */
export function ExerciseCatalog({ exercises }: { exercises: CbtExercise[] }) {
  if (exercises.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8]">
        Catalog isn’t loaded — try refreshing; the seed migration may still
        be running.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {exercises.map((ex) => (
        <li key={ex.id}>
          <Link
            href={`/dashboard/os/health/cbt/${ex.kind}/new`}
            className="block rounded-xl border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/50 hover:bg-[#1a1d27] transition p-5 group"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#4361EE] mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white group-hover:text-[#cbd5e1] transition">
                  {ex.name}
                </h3>
                <p className="text-xs text-[#94a3b8] mt-1.5 leading-relaxed">
                  {ex.description}
                </p>
                {ex.citation && (
                  <p className="text-[10px] text-[#94a3b8]/70 mt-2 leading-relaxed">
                    Source: {ex.citation}
                  </p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-[#4361EE] shrink-0 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
