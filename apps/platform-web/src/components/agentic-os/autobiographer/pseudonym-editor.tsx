/**
 * Autobiographer OS — PseudonymEditor.
 *
 * Slim wrapper around PseudonymRow that the privacy hub renders once
 * per person. Kept as a separate file so future enhancements (e.g.
 * a "preview" panel showing where the pseudonym substitutes today)
 * can land here without bloating the row component.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { PseudonymRow } from './pseudonym-row';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export interface PseudonymEditorProps {
  bookId: string;
  personId: string;
  personCanonicalName: string;
  personAliases: readonly string[];
  consentState: ConsentState;
  pseudonymId: string | null;
  initialPseudonym: string;
  initialNotes: string | null;
  applied: boolean;
}

export function PseudonymEditor(props: PseudonymEditorProps) {
  return <PseudonymRow {...props} />;
}
