/**
 * Research OS Phase 3 — experiment ↔ hypothesis N:M join domain types.
 *
 * One experiment can test multiple hypotheses; one hypothesis can be
 * tested across multiple experiments. The join row carries a `role`
 * (`tests` / `motivates` / `related`) so the same pair can appear with
 * different roles — the DB UNIQUE constraint is on the (experiment_id,
 * hypothesis_id, role) tuple, not just the pair.
 *
 * `experiment_id` carries NO FK per the v0.1.30 platform contract; the
 * BFF route layer validates both sides belong to the caller via JOIN
 * before allowing the link.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

export const LINK_ROLES = ['tests', 'motivates', 'related'] as const;
export type LinkRole = (typeof LINK_ROLES)[number];

export const LINK_ROLE_LABELS: Record<LinkRole, string> = {
  tests: 'Tests',
  motivates: 'Motivates',
  related: 'Related',
};

export const LINK_ROLE_DESCRIPTIONS: Record<LinkRole, string> = {
  tests: 'This experiment directly tests the hypothesis.',
  motivates: 'The hypothesis motivated the experiment, but the experiment is not the test.',
  related: 'Looser connection — relevant but neither tests nor motivates.',
};

export interface ExperimentHypothesisLink {
  id: string;
  experimentId: string;
  hypothesisId: string;
  role: LinkRole;
  notes: string | null;
  createdAt: string;
}

/**
 * Joined view returned by `experiments/[id]/hypotheses` GET — the link
 * row plus the hypothesis it points at.
 */
export interface LinkedHypothesis {
  link: ExperimentHypothesisLink;
  hypothesis: import('./hypotheses').Hypothesis;
}

export interface CreateLinkInput {
  hypothesisId: string;
  role?: LinkRole;
  notes?: string | null;
}

export interface UpdateLinkInput {
  role?: LinkRole;
  notes?: string | null;
}

/** Type guard — returns the typed role or null. */
export function asLinkRole(value: unknown): LinkRole | null {
  if (typeof value !== 'string') return null;
  return (LINK_ROLES as readonly string[]).includes(value)
    ? (value as LinkRole)
    : null;
}
