'use client';

/**
 * Research OS Phase 4 — Library page "Add paper" toggle.
 *
 * Small client wrapper that toggles the `PaperForm` open/closed.
 * Lives separately from the page so the server component can stay
 * pure-data.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PaperForm } from './paper-form';

interface Props {
  initialShowNew?: boolean;
}

export function LibraryPageActions({ initialShowNew = false }: Props) {
  const [showNew, setShowNew] = useState(initialShowNew);
  return (
    <div data-testid="library-page-actions">
      {!showNew ? (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/85"
          data-testid="library-add-paper-toggle"
        >
          <Plus className="w-3.5 h-3.5" />
          Add paper
        </button>
      ) : (
        <div
          className="rounded-xl border border-accent/40 bg-surface-2 p-4"
          data-testid="library-add-paper-form"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Add paper
            </h2>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="text-text-secondary hover:text-white"
              aria-label="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <PaperForm onCancel={() => setShowNew(false)} />
        </div>
      )}
    </div>
  );
}
