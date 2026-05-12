/**
 * Research OS Phase 5 — protocol kind enum + display helpers.
 *
 * Five-value taxonomy matching the migration's CHECK constraint on
 * `agos_research_protocols.kind`.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

export const PROTOCOL_KINDS = [
  'method',
  'sop',
  'analysis',
  'code_pipeline',
  'other',
] as const;

export type ProtocolKind = (typeof PROTOCOL_KINDS)[number];

export const PROTOCOL_KIND_LABELS: Record<ProtocolKind, string> = {
  method: 'Method',
  sop: 'SOP',
  analysis: 'Analysis',
  code_pipeline: 'Code pipeline',
  other: 'Other',
};

export const PROTOCOL_KIND_DESCRIPTIONS: Record<ProtocolKind, string> = {
  method: 'A documented research method or technique.',
  sop: 'A standard operating procedure — step-by-step, regulated.',
  analysis: 'An analysis plan or procedure.',
  code_pipeline: 'A code-driven processing pipeline.',
  other: 'Any other protocol kind.',
};

export function asProtocolKind(value: unknown): ProtocolKind | null {
  if (typeof value !== 'string') return null;
  return (PROTOCOL_KINDS as readonly string[]).includes(value)
    ? (value as ProtocolKind)
    : null;
}
