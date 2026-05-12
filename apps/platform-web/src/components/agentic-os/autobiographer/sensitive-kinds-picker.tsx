'use client';

/**
 * Autobiographer OS — SensitiveKindsPicker.
 *
 * Multi-select chip input over the Phase 6 sensitive-kind taxonomy.
 * Used on memory and revision edit surfaces. Submits the full set to
 * the appropriate PATCH endpoint via `endpoint`. Mirrors the Phase 5
 * theme-picker UX pattern (chips + add-from-list + remove).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ShieldAlert } from 'lucide-react';
import { SensitiveKindChip } from './sensitive-kind-chip';
import {
  SENSITIVE_KINDS,
  SENSITIVE_KIND_DESCRIPTIONS,
  SENSITIVE_KIND_LABELS,
  type SensitiveKind,
} from '@/lib/agentic-os/autobiographer/sensitive-kinds';

export interface SensitiveKindsPickerProps {
  /** PATCH endpoint that accepts a `sensitiveKinds` body. */
  endpoint: string;
  initial: readonly SensitiveKind[];
  /** Label rendered above the chip strip. */
  label?: string;
}

export function SensitiveKindsPicker({
  endpoint,
  initial,
  label = 'Sensitive content tags',
}: SensitiveKindsPickerProps) {
  const router = useRouter();
  const [current, setCurrent] = useState<SensitiveKind[]>(() =>
    Array.from(new Set(initial)).sort(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => new Set(current), [current]);
  const available = useMemo(
    () => SENSITIVE_KINDS.filter((k) => !selected.has(k)),
    [selected],
  );

  async function persist(next: SensitiveKind[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sensitiveKinds: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      setCurrent(next);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save tags');
    } finally {
      setBusy(false);
    }
  }

  function addKind(kind: SensitiveKind) {
    if (selected.has(kind)) return;
    const next = Array.from(new Set([...current, kind])).sort();
    void persist(next);
  }

  function removeKind(kind: SensitiveKind) {
    const next = current.filter((k) => k !== kind);
    void persist(next);
  }

  return (
    <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-[#94a3b8] inline-flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-300/80" />
          {label}
        </h3>
        {busy && (
          <span className="text-xs text-[#94a3b8]">Saving…</span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {current.length === 0 ? (
        <p className="text-xs text-[#64748b] italic">
          No sensitive tags. Add below if the content warrants a flag.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {current.map((k) => (
            <SensitiveKindChip
              key={k}
              kind={k}
              size="md"
              onRemove={() => removeKind(k)}
            />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => addKind(k)}
              disabled={busy}
              title={SENSITIVE_KIND_DESCRIPTIONS[k]}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-dashed border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/40 transition"
            >
              <Plus className="w-3 h-3" />
              {SENSITIVE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
