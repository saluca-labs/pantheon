'use client';

import { useState } from 'react';
import { Activity, Apple, Brain, Moon, RefreshCw, Sparkles } from 'lucide-react';

interface HolisticPlan {
  activity: string[];
  nutrition: string[];
  sleep: string[];
  mental_health: string[];
}

const SECTIONS: Array<{
  key: keyof HolisticPlan;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}> = [
  { key: 'activity', label: 'Activity', icon: Activity, tone: 'text-sky-300' },
  { key: 'nutrition', label: 'Nutrition', icon: Apple, tone: 'text-emerald-300' },
  { key: 'sleep', label: 'Sleep', icon: Moon, tone: 'text-indigo-300' },
  {
    key: 'mental_health',
    label: 'Mental health',
    icon: Brain,
    tone: 'text-fuchsia-300',
  },
];

export function HolisticPlanGenerator() {
  const [plan, setPlan] = useState<HolisticPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/coach/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.message || data.error || `HTTP ${r.status}`);
      }
      setPlan(data.plan as HolisticPlan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94a3b8] max-w-2xl">
          A 1-week plan covering activity, nutrition, sleep, and mental health,
          grounded in your recent snapshot. Plans are generated fresh on every
          click — copy what's useful into your journal or notes.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a55d6] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          {plan ? (
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          ) : (
            <Sparkles className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
          )}
          {loading ? 'Generating…' : plan ? 'Regenerate' : 'Generate plan'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {plan && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SECTIONS.map(({ key, label, icon: Icon, tone }) => (
            <div
              key={key}
              className="rounded-xl border border-[#2a2d3e] bg-[#0f1117] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${tone}`} />
                <h3 className="text-sm font-semibold text-white">{label}</h3>
              </div>
              <ul className="space-y-2">
                {plan[key].map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm text-[#cbd5e1] leading-relaxed flex gap-2"
                  >
                    <span className="text-[#64748b] font-mono text-xs mt-0.5">
                      {i + 1}.
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
