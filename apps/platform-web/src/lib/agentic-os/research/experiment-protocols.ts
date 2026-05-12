/**
 * Research OS Phase 5 — experiment-protocol (with version pinning) types.
 *
 * Same (experiment, protocol) pair may be pinned at different
 * `pinned_version` values — the UNIQUE
 * (experiment_id, protocol_id, pinned_version) triple keeps each pin
 * distinct. `pinned_version` is a frozen string at link time, NOT a
 * pointer to the row whose `version` it matches.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import type { Protocol } from './protocols';

export interface ExperimentProtocolLink {
  id: string;
  experimentId: string;
  protocolId: string;
  pinnedVersion: string;
  notes: string | null;
  createdAt: string;
}

export interface LinkedProtocolPin {
  link: ExperimentProtocolLink;
  protocol: Protocol;
  /**
   * The exact protocol row whose `version` matches `pinnedVersion`,
   * resolved via the parent_protocol_id walker. Falls back to the root
   * (protocol) when no exact match exists in the tree.
   */
  resolved: Protocol;
}

export interface CreateExperimentProtocolInput {
  protocolId: string;
  /** If omitted, the route defaults to the protocol's current version. */
  pinnedVersion?: string;
  notes?: string | null;
}

export interface UpdateExperimentProtocolInput {
  /** Only notes are patchable — pinned_version is immutable. */
  notes?: string | null;
}
