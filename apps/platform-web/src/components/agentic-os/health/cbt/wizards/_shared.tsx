'use client';

/**
 * Shared bits for the seven CBT wizards. Kept in a sibling helper file
 * so each wizard stays focused on its own data shape; the form
 * primitives (inputs, mood scale, submit row) live here.
 */

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';

export interface SubmitProps {
  kind: string;
  data: Record<string, unknown>;
  exerciseId?: string | null;
  moodBefore?: number | null;
  moodAfter?: number | null;
  notes?: string | null;
}

export function useCbtSubmit() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: SubmitProps): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/cbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      const id = data.log?.id;
      if (id) {
        router.push(`/dashboard/os/health/cbt/logs/${id}`);
      } else {
        router.push(`/dashboard/os/health/cbt/logs`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}

export function MoodScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? null : n)}
              className={`w-8 h-8 rounded-md border text-xs font-medium transition ${
                active
                  ? 'border-[#4361EE] bg-[#4361EE]/20 text-white'
                  : 'border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:border-[#4361EE]/40 hover:text-white'
              }`}
            >
              {n}
            </button>
          );
        })}
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 text-[10px] text-[#94a3b8] hover:text-white transition"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-white placeholder:text-[#94a3b8] px-3 py-2 leading-relaxed resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-white placeholder:text-[#94a3b8] px-3 py-2"
        />
      )}
    </div>
  );
}

export function SubmitBar({
  submitting,
  disabled,
  error,
  onClick,
  label,
  children,
}: {
  submitting: boolean;
  disabled?: boolean;
  error?: string | null;
  onClick: () => void;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#2a2d3e]">
      <button
        type="button"
        onClick={onClick}
        disabled={submitting || disabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
      >
        <Save className="w-4 h-4" />
        {submitting ? 'Saving…' : (label ?? 'Save log')}
      </button>
      {children}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
