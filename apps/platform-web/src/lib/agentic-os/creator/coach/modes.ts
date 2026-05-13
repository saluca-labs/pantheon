/**
 * Creator OS coach — mode taxonomy.
 *
 * Shared by the migration CHECK constraint, the session repo, the
 * system-prompt builder, the API route validators, and the UI mode
 * picker. Keeping a single source of truth for the five locked modes
 * means a typo in one layer surfaces as a type / test error in every
 * other layer.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

export const COACH_MODE_VALUES = [
  'content_strategist',
  'writing_coach',
  'audience_builder',
  'monetization_advisor',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  content_strategist: 'Content Strategist',
  writing_coach: 'Writing Coach',
  audience_builder: 'Audience Builder',
  monetization_advisor: 'Monetization Advisor',
  general: 'General Assistant',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  content_strategist:
    'Editorial planning, topic clusters, content calendars, and cross-channel strategy.',
  writing_coach:
    'Draft review, tone, structure, headlines, and narrative flow.',
  audience_builder:
    'Growth tactics, engagement, subscriber conversion, and community building.',
  monetization_advisor:
    'Pricing, sponsorships, product-market fit, and revenue diversification.',
  general:
    'Any creator-related question — strategy, craft, or business.',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  content_strategist: [
    'Help me plan an editorial calendar for the next month.',
    'What topic clusters should I focus on?',
    'Analyze my recent content for gaps.',
    'Suggest a cross-channel repurposing strategy.',
  ],
  writing_coach: [
    'Review this draft and suggest improvements.',
    'My headlines are weak — how can I improve them?',
    'Help me structure this long-form piece.',
    'Is my tone consistent across this draft?',
  ],
  audience_builder: [
    'How can I grow my subscriber list?',
    'What engagement tactics work for my niche?',
    'Analyze my post performance patterns.',
    'How do I convert free readers to paid subscribers?',
  ],
  monetization_advisor: [
    'What should I charge for my paid tier?',
    'How do I approach sponsorships for my audience size?',
    'Is my product-market fit strong enough to raise prices?',
    'What alternative revenue streams should I explore?',
  ],
  general: [
    'Give me a snapshot of my content business.',
    'What should I focus on this week?',
    'How do I balance quality and consistency?',
    'Where am I spending time with the least return?',
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}
