'use client';

import { useState } from 'react';
import { SCREENERS, type ScreenerKey, type ScreenerResult } from '@/lib/agentic-os/health/screeners';
import { CrisisBanner } from './crisis-banner';

interface Props {
  screener: ScreenerKey;
}

const SEVERITY_LABEL: Record<string, string> = {
  minimal: 'Minimal',
  mild: 'Mild',
  moderate: 'Moderate',
  moderately_severe: 'Moderately severe',
  severe: 'Severe',
};

const SEVERITY_CLASS: Record<string, string> = {
  minimal: 'text-emerald-300',
  mild: 'text-emerald-300',
  moderate: 'text-amber-300',
  moderately_severe: 'text-orange-300',
  severe: 'text-red-300',
};

export function ScreenerWizard({ screener }: Props) {
  const def = SCREENERS[screener];
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(def.questions.length).fill(null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setAt(i: number, v: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  const allAnswered = answers.every((a) => a !== null);

  async function onSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/screeners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screener, answers: answers as number[] }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Submission failed');
      setResult({
        score: data.result.score,
        severity: data.result.severity,
        crisisFlag: data.result.crisisFlag,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setAnswers(Array(def.questions.length).fill(null));
    setResult(null);
    setError(null);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">{def.title}</h2>
      <p className="text-sm text-[#94a3b8] mb-3">{def.description}</p>

      {result ? (
        <div className="space-y-4">
          {result.crisisFlag && (
            <CrisisBanner
              compact
              body="Your responses include a signal that we want to address right away. Plan generation is paused."
            />
          )}
          <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#94a3b8]">Score</span>
              <span className="text-2xl font-semibold text-white">
                {result.score}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#94a3b8]">Severity</span>
              <span className={`text-sm font-semibold ${SEVERITY_CLASS[result.severity]}`}>
                {SEVERITY_LABEL[result.severity] ?? result.severity}
              </span>
            </div>
          </div>
          <p className="text-xs text-[#94a3b8]/80">
            This score is for self-awareness only and is not a diagnosis. If
            symptoms are interfering with your daily life, please connect with
            a licensed clinician.
          </p>
          <button
            onClick={reset}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:bg-[#1a1d27] text-sm text-white px-3 py-2 transition"
          >
            Take again
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-white mb-3 italic">{def.prompt}</p>
          <div className="space-y-3">
            {def.questions.map((q, i) => (
              <div
                key={q.id}
                className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3"
              >
                <p className="text-sm text-white mb-2">
                  <span className="text-[#94a3b8] mr-2">{q.id}.</span>
                  {q.text}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {def.options.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setAt(i, opt.value)}
                      className={`text-xs rounded border px-2 py-1.5 transition text-left ${
                        answers[i] === opt.value
                          ? 'border-[#4361EE] bg-[#4361EE]/15 text-white'
                          : 'border-[#2a2d3e] bg-[#1a1d27] text-[#cbd5e1] hover:border-[#4361EE]/50'
                      }`}
                    >
                      <span className="block font-mono text-[10px] text-[#94a3b8]">
                        {opt.value}
                      </span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!allAnswered || submitting}
              className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
            >
              {submitting ? 'Submitting…' : `Submit ${def.title}`}
            </button>
            {!allAnswered && (
              <span className="text-xs text-[#94a3b8]">
                {answers.filter((a) => a === null).length} question
                {answers.filter((a) => a === null).length === 1 ? '' : 's'} left
              </span>
            )}
            {error && <span className="text-xs text-red-300">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
