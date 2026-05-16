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
  { key: 'activity', label: 'Activity', icon: Activity, tone: 'text-os-research' },
  { key: 'nutrition', label: 'Nutrition', icon: Apple, tone: 'text-positive' },
  { key: 'sleep', label: 'Sleep', icon: Moon, tone: 'text-os-autobiographer' },
  {
    key: 'mental_health',
    label: 'Mental health',
    icon: Brain,
    tone: 'text-os-creator',
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
        <p className="text-xs text-text-secondary max-w-2xl">
          A 1-week plan covering activity, nutrition, sleep, and mental health,
          grounded in your recent snapshot. Plans are generated fresh on every
          click — copy what's useful into your journal or notes.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
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
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {plan && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SECTIONS.map(({ key, label, icon: Icon, tone }) => (
            <div
              key={key}
              className="rounded-xl border border-border-subtle bg-surface-0 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${tone}`} />
                <h3 className="text-sm font-semibold text-white">{label}</h3>
              </div>
              <ul className="space-y-2">
                {plan[key].map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm text-text-primary leading-relaxed flex gap-2"
                  >
                    <span className="text-text-tertiary font-mono text-xs mt-0.5">
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
