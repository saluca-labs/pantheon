/**
 * Research OS Phase 3 — pure-lib type / helper tests.
 *
 * Covers the type-guard and validator helpers across the new modules:
 *   - predictions.ts:           asPredictionKind, PREDICTION_KINDS
 *   - evidence.ts:              asEvidencePolarity, asEvidenceSourceKind,
 *                               validateEvidenceInput
 *   - experiment-hypotheses.ts: asLinkRole, LINK_ROLES
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PREDICTION_KINDS,
  PREDICTION_KIND_LABELS,
  asPredictionKind,
} from '@/lib/agentic-os/research/predictions';
import {
  EVIDENCE_POLARITIES,
  EVIDENCE_POLARITY_LABELS,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SOURCE_KIND_LABELS,
  EVIDENCE_SOURCE_KIND_ICON,
  asEvidencePolarity,
  asEvidenceSourceKind,
  validateEvidenceInput,
} from '@/lib/agentic-os/research/evidence';
import {
  LINK_ROLES,
  LINK_ROLE_LABELS,
  asLinkRole,
} from '@/lib/agentic-os/research/experiment-hypotheses';

describe('predictions — types + guards', () => {
  it('PREDICTION_KINDS lists exactly the 4 canonical values', () => {
    expect([...PREDICTION_KINDS]).toEqual([
      'positive',
      'negative',
      'magnitude',
      'direction',
    ]);
  });

  it('PREDICTION_KIND_LABELS has a label per kind', () => {
    for (const k of PREDICTION_KINDS) {
      expect(PREDICTION_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('asPredictionKind accepts each valid value', () => {
    for (const k of PREDICTION_KINDS) {
      expect(asPredictionKind(k)).toBe(k);
    }
  });

  it('asPredictionKind rejects unknown strings', () => {
    expect(asPredictionKind('weird')).toBeNull();
    expect(asPredictionKind('')).toBeNull();
  });

  it('asPredictionKind rejects non-strings', () => {
    expect(asPredictionKind(null)).toBeNull();
    expect(asPredictionKind(undefined)).toBeNull();
    expect(asPredictionKind(42)).toBeNull();
    expect(asPredictionKind({})).toBeNull();
  });
});

describe('evidence — types + guards', () => {
  it('EVIDENCE_POLARITIES lists supports/refutes/mixed', () => {
    expect([...EVIDENCE_POLARITIES]).toEqual(['supports', 'refutes', 'mixed']);
  });

  it('EVIDENCE_SOURCE_KINDS lists exactly the 5 canonical values', () => {
    expect([...EVIDENCE_SOURCE_KINDS]).toEqual([
      'notebook_entry',
      'paper',
      'dataset',
      'external_url',
      'free_text',
    ]);
  });

  it('per-kind labels + icons resolve for every source kind', () => {
    for (const k of EVIDENCE_SOURCE_KINDS) {
      expect(EVIDENCE_SOURCE_KIND_LABELS[k]).toBeTruthy();
      expect(EVIDENCE_SOURCE_KIND_ICON[k]).toBeTruthy();
    }
    for (const p of EVIDENCE_POLARITIES) {
      expect(EVIDENCE_POLARITY_LABELS[p]).toBeTruthy();
    }
  });

  it('asEvidencePolarity / asEvidenceSourceKind round-trip valid values', () => {
    for (const p of EVIDENCE_POLARITIES) expect(asEvidencePolarity(p)).toBe(p);
    for (const k of EVIDENCE_SOURCE_KINDS) expect(asEvidenceSourceKind(k)).toBe(k);
  });

  it('asEvidencePolarity / asEvidenceSourceKind reject unknown values', () => {
    expect(asEvidencePolarity('strong')).toBeNull();
    expect(asEvidenceSourceKind('image')).toBeNull();
    expect(asEvidencePolarity(0)).toBeNull();
    expect(asEvidenceSourceKind(false)).toBeNull();
  });
});

describe('evidence — validateEvidenceInput()', () => {
  it('flags invalid polarity', () => {
    const errs = validateEvidenceInput({
      polarity: 'strong',
      sourceKind: 'free_text',
      notes: 'x',
    });
    expect(errs.some((e) => /Invalid polarity/.test(e))).toBe(true);
  });

  it('flags invalid source_kind and short-circuits other checks', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'bogus',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/Invalid source_kind/);
  });

  it('external_url requires source_url', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'external_url',
    });
    expect(errs.some((e) => /source_url is required/.test(e))).toBe(true);
  });

  it('external_url with non-empty source_url passes', () => {
    expect(
      validateEvidenceInput({
        polarity: 'supports',
        sourceKind: 'external_url',
        sourceUrl: 'https://example.com',
      }),
    ).toEqual([]);
  });

  it('external_url with whitespace-only source_url fails', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'external_url',
      sourceUrl: '   ',
    });
    expect(errs.some((e) => /source_url is required/.test(e))).toBe(true);
  });

  it('notebook_entry requires source_id', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'notebook_entry',
    });
    expect(errs.some((e) => /source_id is required/.test(e))).toBe(true);
  });

  it('paper requires source_id', () => {
    const errs = validateEvidenceInput({
      polarity: 'mixed',
      sourceKind: 'paper',
    });
    expect(errs.some((e) => /source_id is required/.test(e))).toBe(true);
  });

  it('dataset requires source_id', () => {
    const errs = validateEvidenceInput({
      polarity: 'refutes',
      sourceKind: 'dataset',
    });
    expect(errs.some((e) => /source_id is required/.test(e))).toBe(true);
  });

  it('free_text requires notes', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'free_text',
    });
    expect(errs.some((e) => /notes is required/.test(e))).toBe(true);
  });

  it('free_text with whitespace-only notes fails', () => {
    const errs = validateEvidenceInput({
      polarity: 'supports',
      sourceKind: 'free_text',
      notes: '   ',
    });
    expect(errs.some((e) => /notes is required/.test(e))).toBe(true);
  });

  it('free_text with non-empty notes passes', () => {
    expect(
      validateEvidenceInput({
        polarity: 'supports',
        sourceKind: 'free_text',
        notes: 'evidence text',
      }),
    ).toEqual([]);
  });

  it('valid notebook_entry shape passes', () => {
    expect(
      validateEvidenceInput({
        polarity: 'supports',
        sourceKind: 'notebook_entry',
        sourceId: 'ne-1',
      }),
    ).toEqual([]);
  });
});

describe('experiment-hypotheses — link roles', () => {
  it('LINK_ROLES lists tests/motivates/related', () => {
    expect([...LINK_ROLES]).toEqual(['tests', 'motivates', 'related']);
  });

  it('LINK_ROLE_LABELS has a label per role', () => {
    for (const r of LINK_ROLES) expect(LINK_ROLE_LABELS[r]).toBeTruthy();
  });

  it('asLinkRole round-trips valid values', () => {
    for (const r of LINK_ROLES) expect(asLinkRole(r)).toBe(r);
  });

  it('asLinkRole rejects unknown values', () => {
    expect(asLinkRole('owns')).toBeNull();
    expect(asLinkRole(null)).toBeNull();
    expect(asLinkRole(undefined)).toBeNull();
  });
});
