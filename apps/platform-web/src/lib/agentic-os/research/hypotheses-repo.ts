/**
 * Research OS Phase 3 — hypothesis repo surface (re-export module).
 *
 * The hypothesis CRUD helpers were authored in Phase 1 inside the
 * shared `repo.ts`. Phase 3 ships a dedicated module so the Phase 3
 * route layer + tests can import from a hypothesis-specific path
 * matching the rest of the new repos:
 *
 *   - predictions-repo.ts
 *   - falsifiers-repo.ts
 *   - evidence-repo.ts
 *   - experiment-hypotheses-repo.ts
 *   - hypotheses-repo.ts       <-- this file
 *
 * Behaviour is unchanged; the underlying queries still live in
 * `./repo`. Two thin helpers (`archive`, `restore`) are exposed here as
 * a single named export for the Phase 3 route ergonomics.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

export {
  listHypotheses,
  getHypothesis,
  createHypothesis,
  updateHypothesis,
  archiveHypothesis,
  restoreHypothesis,
} from './repo';

export type { HypothesisUpsert, ListHypothesesOpts } from './repo';

import { archiveHypothesis, restoreHypothesis } from './repo';

/**
 * Convenience alias — matches the Phase 3 spec naming (`archive(id, userId)`).
 */
export async function archive(id: string, userId: string) {
  return archiveHypothesis(id, userId);
}

/**
 * Convenience alias — matches the Phase 3 spec naming (`restore(id, userId)`).
 * Returns the same { hypothesis, alreadyActive } envelope as the underlying
 * `restoreHypothesis`.
 */
export async function restore(id: string, userId: string) {
  return restoreHypothesis(id, userId);
}
