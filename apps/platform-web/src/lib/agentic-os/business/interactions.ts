/**
 * Business OS Phase 1 — interaction domain types + pure helpers.
 *
 * DB calls live in `interactions-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { INTERACTION_TYPES, type Interaction, type InteractionType } from './crm';

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreateInteractionInput {
  personId?: string | null;
  organizationId?: string | null;
  interactionType: InteractionType;
  summary: string;
  occurredAt?: string;
}

export type UpdateInteractionInput = Partial<{
  personId: string | null;
  organizationId: string | null;
  interactionType: InteractionType;
  summary: string;
  occurredAt: string;
}>;

// ─── Filter ──────────────────────────────────────────────────────────────

export interface InteractionsListOpts {
  personId?: string;
  organizationId?: string;
  /** ISO date string — inclusive. */
  from?: string;
  /** ISO date string — inclusive. */
  to?: string;
  interactionType?: InteractionType;
  limit?: number;
  offset?: number;
}

export function interactionMatchesFilter(
  interaction: Pick<
    Interaction,
    'personId' | 'organizationId' | 'interactionType' | 'occurredAt'
  >,
  opts: InteractionsListOpts,
): boolean {
  if (opts.personId && interaction.personId !== opts.personId) return false;
  if (opts.organizationId && interaction.organizationId !== opts.organizationId) return false;
  if (opts.interactionType && interaction.interactionType !== opts.interactionType) return false;
  if (opts.from) {
    if (interaction.occurredAt < opts.from) return false;
  }
  if (opts.to) {
    if (interaction.occurredAt > opts.to) return false;
  }
  return true;
}

// ─── Validators ──────────────────────────────────────────────────────────

export function validateInteractionType(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (!(INTERACTION_TYPES as readonly string[]).includes(value)) {
    return `must be one of: ${INTERACTION_TYPES.join(', ')}`;
  }
  return null;
}

export function validateInteractionSummary(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 2000) return 'too long (max 2000 chars)';
  return null;
}

export { INTERACTION_TYPES, type Interaction, type InteractionType };
