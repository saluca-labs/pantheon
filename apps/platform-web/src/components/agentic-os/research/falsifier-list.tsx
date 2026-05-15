'use client';

/**
 * Research OS Phase 3 — Falsifiers section for the hypothesis detail page.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { Plus, AlertOctagon } from 'lucide-react';
import { FalsifierCard } from './falsifier-card';
import { FalsifierEditor } from './falsifier-editor';
import type { Falsifier } from '@/lib/agentic-os/research/falsifiers';

interface Props {
  hypothesisId: string;
  initialFalsifiers: Falsifier[];
}

export function FalsifierList({ hypothesisId, initialFalsifiers }: Props) {
  const [falsifiers, setFalsifiers] = useState<Falsifier[]>(initialFalsifiers);
  const [adding, setAdding] = useState(false);

  function onCreated(f: Falsifier) {
    setFalsifiers((prev) => [...prev, f]);
    setAdding(false);
  }
  function onUpdated(f: Falsifier) {
    setFalsifiers((prev) => prev.map((x) => (x.id === f.id ? f : x)));
  }
  function onDeleted(id: string) {
    setFalsifiers((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section aria-labelledby="falsifiers-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            id="falsifiers-heading"
            className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
          >
            <AlertOctagon className="w-4 h-4 text-danger" />
            Falsifiers
          </h2>
          <p className="text-xs text-text-secondary">
            What observation would refute this hypothesis? Pre-register the
            criterion before you start running.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-secondary hover:text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add falsifier
          </button>
        )}
      </div>

      {adding && (
        <FalsifierEditor
          mode="create"
          hypothesisId={hypothesisId}
          onCreated={onCreated}
          onCancel={() => setAdding(false)}
        />
      )}

      {falsifiers.length === 0 && !adding ? (
        <p className="text-sm text-text-secondary italic">No falsifiers yet.</p>
      ) : (
        <div className="space-y-2">
          {falsifiers.map((f) => (
            <FalsifierCard
              key={f.id}
              falsifier={f}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </section>
  );
}
