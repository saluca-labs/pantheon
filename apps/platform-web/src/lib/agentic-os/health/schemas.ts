/**
 * Zod input schemas for Health OS BFF routes and repo writes.
 *
 * Kept in a parallel file (not inlined) so route handlers, server
 * actions, and tests share one validation source of truth.
 */

import { z } from 'zod';

// ─── Mental-health profile ────────────────────────────────────────────────

export const SLEEP_QUALITY_VALUES = ['poor', 'fair', 'good', 'excellent'] as const;
export const SUPPORT_SYSTEM_VALUES = ['none', 'limited', 'moderate', 'strong'] as const;

export const MentalProfileBody = z.object({
  stressBaseline: z.number().int().min(0).max(10).nullable().optional(),
  sleepQuality: z.enum(SLEEP_QUALITY_VALUES).nullable().optional(),
  supportSystem: z.enum(SUPPORT_SYSTEM_VALUES).nullable().optional(),
  currentTherapy: z.boolean().optional(),
  currentMeds: z.boolean().optional(),
  medNotes: z.string().max(2000).nullable().optional(),
  goals: z.array(z.string().min(1).max(160)).max(20).optional(),
});
export type MentalProfileInput = z.infer<typeof MentalProfileBody>;

// ─── Consent ──────────────────────────────────────────────────────────────

export const CONSENT_SCOPE_VALUES = ['physical', 'mental', 'integrations'] as const;
export type ConsentScope = (typeof CONSENT_SCOPE_VALUES)[number];

export const ConsentBody = z.object({
  scope: z.enum(CONSENT_SCOPE_VALUES),
  granted: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConsentInput = z.infer<typeof ConsentBody>;

// ─── Risk flags ───────────────────────────────────────────────────────────

export const RISK_FLAG_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type RiskFlagSeverityValue = (typeof RISK_FLAG_SEVERITY_VALUES)[number];

export const RiskFlagDismissQuery = z.object({
  id: z.string().uuid(),
});
