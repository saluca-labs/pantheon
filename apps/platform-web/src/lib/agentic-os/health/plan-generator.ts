/**
 * Health OS plan generator.
 *
 * Rules-based, deterministic, never invented. Every recommendation cites
 * its source so the UI can render the citation alongside the suggestion.
 *
 * Sources:
 *  - HHS Physical Activity Guidelines for Americans, 2nd Ed. (2018)
 *    https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf
 *  - Dietary Guidelines for Americans 2020-2025
 *    https://www.dietaryguidelines.gov/
 *  - CDC sleep guidance for adults
 *    https://www.cdc.gov/sleep/about_sleep/how_much_sleep.html
 *  - National Institute of Mental Health — anxiety / depression management
 *    https://www.nimh.nih.gov/
 *
 * The generator never produces medical, psychiatric, or pharmacological
 * advice. The crisis-safety wall is enforced upstream (in the API route);
 * this module returns a structured plan whose UI is required to render
 * the CaveatBlock alongside.
 */

import type { HealthProfile } from './repo';

export interface PlanSource {
  label: string;
  url: string;
}

export interface PlanRecommendation {
  category: 'activity' | 'nutrition' | 'sleep' | 'mental_health' | 'safety';
  title: string;
  body: string;
  source: PlanSource;
}

export interface HealthPlan {
  summary: string;
  recommendations: PlanRecommendation[];
  sources: PlanSource[];
}

const SOURCES = {
  hhsPa: {
    label: 'HHS Physical Activity Guidelines for Americans, 2nd Ed.',
    url: 'https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf',
  },
  dga: {
    label: 'Dietary Guidelines for Americans 2020-2025',
    url: 'https://www.dietaryguidelines.gov/',
  },
  cdcSleep: {
    label: 'CDC — How much sleep do I need?',
    url: 'https://www.cdc.gov/sleep/about_sleep/how_much_sleep.html',
  },
  nimhAnx: {
    label: 'NIMH — Anxiety Disorders',
    url: 'https://www.nimh.nih.gov/health/topics/anxiety-disorders',
  },
  nimhDep: {
    label: 'NIMH — Depression',
    url: 'https://www.nimh.nih.gov/health/topics/depression',
  },
} as const satisfies Record<string, PlanSource>;

export function generatePlan(profile: HealthProfile | null): HealthPlan {
  const recs: PlanRecommendation[] = [];

  // Activity — HHS PAG: 150-300 min moderate aerobic + 2 strength sessions/wk
  recs.push({
    category: 'activity',
    title: 'Aerobic activity: 150–300 min/week of moderate intensity',
    body:
      'For substantial health benefits, adults should do at least 150 minutes (2 hours and 30 minutes) to 300 minutes (5 hours) a week of moderate-intensity aerobic physical activity (such as brisk walking).',
    source: SOURCES.hhsPa,
  });
  recs.push({
    category: 'activity',
    title: 'Muscle-strengthening: 2 days per week',
    body:
      'Adults should also do muscle-strengthening activities of moderate or greater intensity that involve all major muscle groups on 2 or more days a week.',
    source: SOURCES.hhsPa,
  });

  // Nutrition — DGA: half plate fruits/veg, varied protein, whole grains
  recs.push({
    category: 'nutrition',
    title: 'Build meals around vegetables, fruits, and whole grains',
    body:
      'Make half your plate fruits and vegetables, make half your grains whole grains, and vary your protein routine across seafood, beans, peas, lentils, and lean meats.',
    source: SOURCES.dga,
  });
  recs.push({
    category: 'nutrition',
    title: 'Limit added sugars, saturated fat, and sodium',
    body:
      'Less than 10% of calories per day from added sugars and saturated fat each, and less than 2,300 mg sodium per day for most adults.',
    source: SOURCES.dga,
  });

  // Sleep — CDC: 7+ hours
  recs.push({
    category: 'sleep',
    title: 'Aim for 7+ hours of sleep per night',
    body:
      'Adults aged 18-60 need 7 or more hours of sleep per night for the best health and wellbeing.',
    source: SOURCES.cdcSleep,
  });

  // Mental health baseline
  recs.push({
    category: 'mental_health',
    title: 'Build daily anchors for stress and mood resilience',
    body:
      'Brief, daily routines — outdoor light in the morning, a short walk, social connection, regular sleep schedule — are associated with improved mood and anxiety self-management.',
    source: SOURCES.nimhDep,
  });
  recs.push({
    category: 'mental_health',
    title: 'Use grounded breathing for spikes of anxiety',
    body:
      'Slow paced breathing (e.g. 4-second inhale, 6-second exhale, repeated for 5 minutes) is a low-risk, evidence-supported tool for acute anxiety. If anxiety persistently interferes with daily life, consult a licensed clinician.',
    source: SOURCES.nimhAnx,
  });

  // Profile-specific tweaks
  if (profile?.activityLevel === 'sedentary') {
    recs.push({
      category: 'activity',
      title: 'If currently sedentary, ramp gradually',
      body:
        'Start with 10–15 minute walks most days and add 5 minutes per week. Any movement is better than none, and benefits accrue immediately.',
      source: SOURCES.hhsPa,
    });
  }
  if ((profile?.goals ?? []).some((g) => /sleep/i.test(g))) {
    recs.push({
      category: 'sleep',
      title: 'Lock a consistent wake time, including weekends',
      body:
        'Keeping the same wake time anchors your circadian rhythm and is one of the most effective non-pharmacological sleep interventions.',
      source: SOURCES.cdcSleep,
    });
  }

  const summary = profile
    ? `Personalized starting point based on your profile (activity: ${
        profile.activityLevel ?? 'unspecified'
      }, ${profile.goals.length} goals on file). Always review with your clinician.`
    : 'Generic starting point grounded in HHS, USDA, CDC, and NIMH public guidance. Complete your intake to personalize this further.';

  // De-duplicate sources for the citation footer.
  const seen = new Set<string>();
  const sources: PlanSource[] = [];
  for (const r of recs) {
    if (!seen.has(r.source.url)) {
      seen.add(r.source.url);
      sources.push(r.source);
    }
  }

  return { summary, recommendations: recs, sources };
}
