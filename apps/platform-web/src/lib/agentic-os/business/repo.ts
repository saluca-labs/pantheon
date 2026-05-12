/**
 * Business OS — legacy facade for the contacts CRM.
 *
 * Phase 1 split the monolithic Phase-0 repo into focused modules:
 *   - `orgs-repo.ts`        — organizations CRUD + archive lifecycle
 *   - `people-repo.ts`      — people CRUD + archive lifecycle
 *   - `interactions-repo.ts`— interactions CRUD
 *   - `settings-repo.ts`    — workshop-global business settings
 *
 * This file remains as a thin facade so the legacy
 * `/api/tiresias/agentic-os/business/contacts` route (deprecated by
 * Phase 1; redirects users to the new hub) keeps loading without a
 * data-shape break.  New code should import from the focused modules.
 *
 * Phase 1 also MIGRATES the audit writer off the local helper onto the
 * shared `_shared/audit.ts` writer.  `recordAudit` here is now a thin
 * shim that locks `osSlug: 'business'` and delegates — every route in
 * the new BFF surface calls `_shared/audit.ts` either directly or via
 * this shim.  The local helper from Phase 0 is GONE; this is the only
 * `recordAudit` callable from the `business/` namespace.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { getBusinessPool } from './session';
import {
  recordAudit as sharedRecordAudit,
  type RecordAuditArgs,
} from '../_shared/audit';

export {
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  archiveOrganization,
  restoreOrganization,
  countActivePeopleForOrganization,
} from './orgs-repo';

export {
  listPeople,
  getPerson,
  createPerson,
  updatePerson,
  archivePerson,
  restorePerson,
  countActivePeople,
  countActiveOrganizations,
} from './people-repo';

export {
  listInteractions,
  getInteraction,
  createInteraction,
  updateInteraction,
  deleteInteraction,
} from './interactions-repo';

export {
  getSettings,
  getOrCreateSettings,
  updateSettings,
} from './settings-repo';

export {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  archiveDeal,
  restoreDeal,
  transitionDealStage,
  validateDealOwnership,
  validateContactOwnership,
  validateOrganizationOwnership,
} from './deals-repo';

interface LegacyRecordAuditArgs {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
  projectId?: string | null;
}

/**
 * Slug-parameterized audit writer.  The `osSlug` is locked to
 * `'business'`.  Accepts both the legacy shape (no `pool`/`osSlug`) and
 * the shared shape (with them) for forward-compat — but callers in this
 * tree only ever pass the legacy shape.
 */
export async function recordAudit(
  args: LegacyRecordAuditArgs | Omit<RecordAuditArgs, 'pool' | 'osSlug'>,
): Promise<void> {
  const pool = getBusinessPool();
  await sharedRecordAudit({
    pool,
    osSlug: 'business',
    actorId: args.actorId,
    action: args.action,
    payload: args.payload,
    projectId: args.projectId ?? null,
  });
}
