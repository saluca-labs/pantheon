/**
 * Research OS Phase 7 — coach safety helper tests.
 *
 * Pure unit tests over:
 *   - REGULATED_TOPIC_VALUES — the 4-topic taxonomy
 *   - detectRegulatedTopics — keyword scan logic
 *   - buildReferralFooter — referral copy + body resolution
 *   - getRegulatedTopicSpec — spec lookup
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  REGULATED_TOPIC_VALUES,
  REGULATED_TOPICS,
  buildReferralFooter,
  detectRegulatedTopics,
  getRegulatedTopicSpec,
} from '@/lib/agentic-os/research/coach/safety';

describe('REGULATED_TOPIC_VALUES', () => {
  it('contains the 4 canonical topics', () => {
    expect([...REGULATED_TOPIC_VALUES].sort()).toEqual([
      'clinical_medical',
      'ehs_hazardous_materials',
      'iacuc_animal_use',
      'irb_human_subjects',
    ]);
  });

  it('REGULATED_TOPICS has a spec for every topic value', () => {
    for (const t of REGULATED_TOPIC_VALUES) {
      const spec = REGULATED_TOPICS.find((s) => s.topic === t);
      expect(spec).toBeDefined();
    }
  });

  it('every spec has a non-empty referralBody', () => {
    for (const spec of REGULATED_TOPICS) {
      expect(spec.referralBody.length).toBeGreaterThan(2);
    }
  });

  it('every spec has at least 3 keyword anchors', () => {
    for (const spec of REGULATED_TOPICS) {
      expect(spec.keywords.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('detectRegulatedTopics — IRB human subjects', () => {
  it('detects "IRB" as a word', () => {
    expect(detectRegulatedTopics('Should I send this to my IRB?')).toContain(
      'irb_human_subjects',
    );
  });

  it('detects "institutional review board" multi-word phrase', () => {
    expect(
      detectRegulatedTopics(
        'My institutional review board hasn\'t approved this yet.',
      ),
    ).toContain('irb_human_subjects');
  });

  it('detects "human subjects"', () => {
    expect(
      detectRegulatedTopics('How do I recruit human subjects for this study?'),
    ).toContain('irb_human_subjects');
  });

  it('detects "informed consent"', () => {
    expect(
      detectRegulatedTopics('Draft me an informed consent form'),
    ).toContain('irb_human_subjects');
  });

  it('detects "clinical trial protocol"', () => {
    expect(
      detectRegulatedTopics('Help me draft a clinical trial protocol'),
    ).toContain('irb_human_subjects');
  });
});

describe('detectRegulatedTopics — IACUC animal use', () => {
  it('detects "IACUC"', () => {
    expect(detectRegulatedTopics('Did you submit this to IACUC?')).toContain(
      'iacuc_animal_use',
    );
  });

  it('detects "mouse model"', () => {
    expect(
      detectRegulatedTopics('We need a mouse model for this assay'),
    ).toContain('iacuc_animal_use');
  });

  it('detects "animal protocol"', () => {
    expect(
      detectRegulatedTopics('Write an animal protocol for rats'),
    ).toContain('iacuc_animal_use');
  });
});

describe('detectRegulatedTopics — EHS hazardous materials', () => {
  it('detects "BSL-3"', () => {
    expect(
      detectRegulatedTopics('We need to do this in BSL-3 conditions'),
    ).toContain('ehs_hazardous_materials');
  });

  it('detects "biosafety"', () => {
    expect(
      detectRegulatedTopics('biosafety considerations for this protocol'),
    ).toContain('ehs_hazardous_materials');
  });

  it('detects "radioactive"', () => {
    expect(
      detectRegulatedTopics('handling radioactive samples in the lab'),
    ).toContain('ehs_hazardous_materials');
  });

  it('detects "select agent"', () => {
    expect(
      detectRegulatedTopics('Is this a select agent?'),
    ).toContain('ehs_hazardous_materials');
  });
});

describe('detectRegulatedTopics — clinical / medical', () => {
  it('detects "diagnose"', () => {
    expect(
      detectRegulatedTopics('can you help me diagnose this patient'),
    ).toContain('clinical_medical');
  });

  it('detects "medication dose"', () => {
    expect(
      detectRegulatedTopics('what medication dose should we use?'),
    ).toContain('clinical_medical');
  });

  it('detects "off-label"', () => {
    expect(
      detectRegulatedTopics('an off-label use of this drug'),
    ).toContain('clinical_medical');
  });

  it('detects "prescribe"', () => {
    expect(
      detectRegulatedTopics('can I prescribe this for them'),
    ).toContain('clinical_medical');
  });
});

describe('detectRegulatedTopics — negatives', () => {
  it('returns empty for non-regulated research prose', () => {
    expect(
      detectRegulatedTopics('Help me organize my thermal-management papers'),
    ).toEqual([]);
  });

  it('returns empty for an empty string', () => {
    expect(detectRegulatedTopics('')).toEqual([]);
  });

  it('returns empty for non-string input', () => {
    expect(detectRegulatedTopics(null as any)).toEqual([]);
    expect(detectRegulatedTopics(undefined as any)).toEqual([]);
    expect(detectRegulatedTopics(42 as any)).toEqual([]);
  });

  it('"scribble" does not trip "irb" (whole-word match)', () => {
    expect(detectRegulatedTopics('I have a scribble in my notebook')).toEqual(
      [],
    );
  });

  it('"description" does not trip "ehs" (whole-word match)', () => {
    expect(detectRegulatedTopics('Write me a description of this method')).toEqual(
      [],
    );
  });

  it('is case-insensitive', () => {
    expect(detectRegulatedTopics('REVIEW BY IRB')).toContain(
      'irb_human_subjects',
    );
    expect(detectRegulatedTopics('Iacuc protocol')).toContain('iacuc_animal_use');
  });
});

describe('detectRegulatedTopics — multi-topic', () => {
  it('returns multiple topics when the prompt triggers several', () => {
    const got = detectRegulatedTopics(
      'Need IRB approval and a mouse model in BSL-3 — help with drug dosing',
    );
    expect(got).toContain('irb_human_subjects');
    expect(got).toContain('iacuc_animal_use');
    expect(got).toContain('ehs_hazardous_materials');
    expect(got).toContain('clinical_medical');
  });

  it('returns topics in canonical (taxonomy-declaration) order', () => {
    const got = detectRegulatedTopics(
      'mouse model + IRB review + radioactive isotopes + diagnose',
    );
    // Canonical order: irb / iacuc / ehs / clinical
    expect(got).toEqual([
      'irb_human_subjects',
      'iacuc_animal_use',
      'ehs_hazardous_materials',
      'clinical_medical',
    ]);
  });

  it('dedupes duplicate keyword hits within a topic', () => {
    const got = detectRegulatedTopics('IRB and IRB again and institutional review board');
    expect(got.filter((t) => t === 'irb_human_subjects').length).toBe(1);
  });
});

describe('buildReferralFooter', () => {
  it('returns null for an empty topic list', () => {
    expect(buildReferralFooter([])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(buildReferralFooter(null as any)).toBeNull();
    expect(buildReferralFooter(undefined as any)).toBeNull();
  });

  it('returns a footer for a single IRB topic mentioning the IRB body', () => {
    const f = buildReferralFooter(['irb_human_subjects']);
    expect(f).toBeTruthy();
    expect(f).toMatch(/IRB/);
    expect(f!.toLowerCase()).toMatch(/human-subjects|human subjects/);
  });

  it('returns a footer for IACUC mentioning the IACUC office', () => {
    const f = buildReferralFooter(['iacuc_animal_use']);
    expect(f).toMatch(/IACUC/);
  });

  it('returns a footer for EHS mentioning the EHS office', () => {
    const f = buildReferralFooter(['ehs_hazardous_materials']);
    expect(f).toMatch(/EHS/);
  });

  it('returns a footer for clinical mentioning a licensed clinician', () => {
    const f = buildReferralFooter(['clinical_medical']);
    expect(f).toMatch(/licensed clinician|clinical/i);
  });

  it('returns a multi-line footer listing all triggered bodies', () => {
    const f = buildReferralFooter([
      'irb_human_subjects',
      'iacuc_animal_use',
      'ehs_hazardous_materials',
    ]);
    expect(f).toMatch(/IRB/);
    expect(f).toMatch(/IACUC/);
    expect(f).toMatch(/EHS/);
  });

  it('contains the magic anchor "Regulated-advice referral"', () => {
    const f = buildReferralFooter(['irb_human_subjects']);
    expect(f).toMatch(/Regulated-advice referral/);
  });

  it('contains the canonical refusal phrasing template', () => {
    const f = buildReferralFooter(['irb_human_subjects']);
    expect(f).toMatch(/I can't substitute for/);
  });
});

describe('getRegulatedTopicSpec', () => {
  it('returns the spec for a known topic', () => {
    const spec = getRegulatedTopicSpec('irb_human_subjects');
    expect(spec).toBeTruthy();
    expect(spec!.topic).toBe('irb_human_subjects');
    expect(spec!.referralBody).toMatch(/IRB/);
  });

  it('returns null for an unknown topic', () => {
    expect(getRegulatedTopicSpec('nonsense')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(getRegulatedTopicSpec(null)).toBeNull();
    expect(getRegulatedTopicSpec(undefined)).toBeNull();
    expect(getRegulatedTopicSpec(42)).toBeNull();
  });
});
