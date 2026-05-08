/**
 * Research OS — pure-logic unit tests for hypotheses.ts helpers.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  renderHypothesisStatement,
  validateHypothesis,
  isValidStatusTransition,
} from '@/lib/agentic-os/research/hypotheses';
import type { HypothesisStatus } from '@/lib/agentic-os/research/hypotheses';

describe('renderHypothesisStatement', () => {
  it('formats the If…then…because statement', () => {
    const result = renderHypothesisStatement({
      ifClause: 'temperature exceeds 37°C',
      thenClause: 'enzyme activity decreases by ≥ 20%',
      becauseClause: 'high temp denatures the active site',
    });
    expect(result).toBe(
      'If temperature exceeds 37°C, then enzyme activity decreases by ≥ 20%, because high temp denatures the active site.',
    );
  });
});

describe('validateHypothesis', () => {
  it('returns no errors for a fully populated hypothesis', () => {
    const errors = validateHypothesis({
      title: 'Test',
      ifClause: 'X happens',
      thenClause: 'Y results',
      becauseClause: 'mechanism Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('returns an error when title is empty', () => {
    const errors = validateHypothesis({ title: '', ifClause: 'x', thenClause: 'y', becauseClause: 'z' });
    expect(errors.some((e) => e.includes('Title'))).toBe(true);
  });

  it('returns an error when ifClause is empty', () => {
    const errors = validateHypothesis({ title: 'T', ifClause: '', thenClause: 'y', becauseClause: 'z' });
    expect(errors.some((e) => e.includes('"If"'))).toBe(true);
  });

  it('returns an error when thenClause is empty', () => {
    const errors = validateHypothesis({ title: 'T', ifClause: 'x', thenClause: '', becauseClause: 'z' });
    expect(errors.some((e) => e.includes('"Then"'))).toBe(true);
  });

  it('returns an error when becauseClause is empty', () => {
    const errors = validateHypothesis({ title: 'T', ifClause: 'x', thenClause: 'y', becauseClause: '' });
    expect(errors.some((e) => e.includes('"Because"'))).toBe(true);
  });
});

describe('isValidStatusTransition', () => {
  it('allows draft → active', () => {
    expect(isValidStatusTransition('draft', 'active')).toBe(true);
  });

  it('allows active → testing', () => {
    expect(isValidStatusTransition('active', 'testing')).toBe(true);
  });

  it('allows testing → supported', () => {
    expect(isValidStatusTransition('testing', 'supported')).toBe(true);
  });

  it('allows testing → refuted', () => {
    expect(isValidStatusTransition('testing', 'refuted')).toBe(true);
  });

  it('allows inconclusive → active', () => {
    expect(isValidStatusTransition('inconclusive', 'active')).toBe(true);
  });

  it('disallows draft → supported (must go through active/testing)', () => {
    expect(isValidStatusTransition('draft', 'supported')).toBe(false);
  });

  it('disallows archived → any (terminal state)', () => {
    const targets: HypothesisStatus[] = ['draft', 'active', 'testing', 'supported', 'refuted', 'inconclusive'];
    for (const t of targets) {
      expect(isValidStatusTransition('archived', t)).toBe(false);
    }
  });

  it('allows same-status transitions (no-op)', () => {
    expect(isValidStatusTransition('active', 'active')).toBe(true);
  });
});
