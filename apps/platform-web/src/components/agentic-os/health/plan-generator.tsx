'use client';

import { useState } from 'react';
import { Activity, Apple, Moon, Brain, Shield } from 'lucide-react';
import { CrisisBanner } from './crisis-banner';

interface PlanSource {
  label: string;
  url: string;
}

interface PlanRecommendation {
  category: 'activity' | 'nutrition' | 'sleep' | 'mental_health' | 'safety';
  title: string;
  body: string;
  source: PlanSource;
}

interface HealthPlan {
  summary: string;
  recommendations: PlanRecommendation[];
  sources: PlanSource[];
}

interface BlockedResponse {
  blocked: true;
  reason: 'crisis_safety_wall';
  message: string;
}

const CATEGORY: Record<
  PlanRecommendation['category'],
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  activity: { label: 'Activity', icon: Activity, tone: 'text-sky-300' },
  nutrition: { label: 'Nutrition', icon: Apple, tone: 'text-emerald-300' },
  sleep: { label: 'Sleep', icon: Moon, tone: 'text-indigo-300' },
  mental_health: { label: 'Mental health', icon: Brain, tone: 'text-fuchsia-300' },
  safety: { label: 'Safety', icon: Shield, tone: 'text-red-300' },
};

export function PlanGenerator() {
  const [freeText, setFreeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<HealthPlan | null>(null);
  const [blocked, setBlocked] = useState<BlockedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setPlan(null);
    setBlocked(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeText: freeText || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Plan generation failed');
      if (data.blocked) {
        setBlocked(data as BlockedResponse);
      } else {
        setPlan(data.plan);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
          What’s on your mind today? (optional)
        </label>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          rows={3}
          placeholder="e.g. I want to sleep better and start moving more."
          className="w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none"
        />
        <p className="text-xs text-[#94a3b8]/70 mt-1.5">
          We’ll incorporate your profile, goals, and recent screener results.
          If we detect signs of crisis, we’ll pause and surface support
          resources instead.
        </p>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={loading}
        className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 transition"
      >
        {loading ? 'Generating…' : 'Generate plan'}
      </button>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {blocked && (
        <CrisisBanner
          headline="We’re pausing plan generation."
          body={blocked.message}
        />
      )}

      {plan && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4">
            <p className="text-sm text-white">{plan.summary}</p>
          </div>

          <div className="space-y-3">
            {plan.recommendations.map((r, i) => {
              const cat = CATEGORY[r.category];
              const Icon = cat.icon;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4"
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-1 shrink-0 ${cat.tone}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] uppercase tracking-wide font-medium ${cat.tone}`}
                        >
                          {cat.label}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1">
                        {r.title}
                      </h3>
                      <p className="text-sm text-[#cbd5e1] leading-relaxed mb-2">
                        {r.body}
                      </p>
                      <a
                        href={r.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#4361EE] hover:underline"
                      >
                        Source: {r.source.label}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4">
            <h3 className="text-sm font-semibold text-white mb-2">
              All sources cited above
            </h3>
            <ul className="space-y-1">
              {plan.sources.map((s, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4361EE] hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
