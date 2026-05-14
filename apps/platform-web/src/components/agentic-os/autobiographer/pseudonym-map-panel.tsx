/**
 * Autobiographer OS — PseudonymMapPanel.
 *
 * Per-book panel that lists every person referenced in the book and
 * surfaces the pseudonym editor for each. The page assembles the
 * roster (via memory → chapter → book / memory → book joins) and
 * passes it in; the panel renders without further data fetching.
 *
 * Empty roster → an explanatory blurb pointing the user at the people
 * directory.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { PseudonymEditor } from './pseudonym-editor';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export interface PseudonymMapPanelPerson {
  personId: string;
  canonicalName: string;
  aliases: string[];
  consentState: ConsentState;
  pseudonymId: string | null;
  pseudonym: string;
  notes: string | null;
  applied: boolean;
}

export interface PseudonymMapPanelProps {
  bookId: string;
  people: PseudonymMapPanelPerson[];
}

export function PseudonymMapPanel({
  bookId,
  people,
}: PseudonymMapPanelProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Pseudonym map</h2>
        <span className="text-xs text-text-secondary">
          {people.length} {people.length === 1 ? 'person' : 'people'} referenced
        </span>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed">
        Substitutions apply to chapter / book PDF exports. Whole-token,
        word-boundary, case-preserving on the first letter. Aliases on the
        person row substitute identically to the canonical name.
      </p>

      {people.length === 0 ? (
        <p className="text-xs text-[#64748b] italic">
          No people are referenced in this book yet. Add memories that link
          to people (Phase 2) and they'll appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {people.map((p) => (
            <PseudonymEditor
              key={p.personId}
              bookId={bookId}
              personId={p.personId}
              personCanonicalName={p.canonicalName}
              personAliases={p.aliases}
              consentState={p.consentState}
              pseudonymId={p.pseudonymId}
              initialPseudonym={p.pseudonym}
              initialNotes={p.notes}
              applied={p.applied}
            />
          ))}
        </div>
      )}
    </section>
  );
}
