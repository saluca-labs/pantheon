/**
 * Business OS coach — mode taxonomy.
 *
 * Shared by the migration CHECK constraint, the session repo, the
 * system-prompt builder, the API route validators, and the UI mode
 * picker. Keeping a single source of truth for the five locked modes
 * means a typo in one layer surfaces as a type / test error in every
 * other layer.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

export const COACH_MODE_VALUES = [
  'pricing_advisor',
  'sales_coach',
  'marketing_advisor',
  'business_strategist',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  pricing_advisor: 'Pricing Advisor',
  sales_coach: 'Sales Coach',
  marketing_advisor: 'Marketing Advisor',
  business_strategist: 'Business Strategist',
  general: 'General Coach',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  pricing_advisor:
    'Optimize your rates, packages, and pricing strategy based on your deal history.',
  sales_coach:
    'Improve your pipeline, negotiation tactics, and close rates.',
  marketing_advisor:
    'Refine your messaging, channels, and lead generation based on conversion data.',
  business_strategist:
    'Strategic advice on revenue, margins, client mix, and growth levers.',
  general:
    'Broad business guidance across any topic.',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  pricing_advisor: [
    'Review my current rates — are they competitive?',
    'Suggest a pricing package for my next proposal.',
    'Which of my deals had the best margins?',
    'What should my hourly rate be based on my deal history?',
  ],
  sales_coach: [
    'Walk me through my open pipeline — what should I focus on?',
    'Which deals are at risk of stalling?',
    'What’s my win rate and how can I improve it?',
    'Give me a negotiation strategy for my biggest open deal.',
  ],
  marketing_advisor: [
    'Which lead sources are converting best?',
    'Analyze my deal sources over the last year.',
    'What channels should I invest more in?',
    'How do client tiers correlate with deal value?',
  ],
  business_strategist: [
    'What’s my revenue trend over the last 6 months?',
    'Which clients are my most profitable?',
    'What’s my gross margin and how can I improve it?',
    'Should I raise rates or increase volume?',
  ],
  general: [
    'Give me a snapshot of my business right now.',
    'What should I focus on this week?',
    'What’s the healthiest part of my business?',
    'Where am I losing the most money?',
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}

export function modeRequiresProject(mode: CoachMode): boolean {
  return mode === 'business_strategist';
}

export function modeRequiresDeal(mode: CoachMode): boolean {
  return false;
}
