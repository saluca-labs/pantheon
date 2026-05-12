/**
 * Autobiographer OS — review-checks domain helpers.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_BASE_CHECKS,
  REVIEW_CHECK_KINDS,
  REVIEW_CHECK_STATUSES,
  SATISFIED_STATUSES,
  asReviewCheckKind,
  asReviewCheckStatus,
  validateReviewCheckNotes,
} from '@/lib/agentic-os/autobiographer/review-checks';

describe('taxonomy', () => {
  it('locks the six review-check kinds', () => {
    expect([...REVIEW_CHECK_KINDS]).toEqual([
      'consent_collected',
      'sensitive_flagged',
      'attribution_verified',
      'redaction_applied',
      'third_party_disclaimer',
      'legal_reviewed',
    ]);
  });

  it('locks the four review-check statuses', () => {
    expect([...REVIEW_CHECK_STATUSES]).toEqual([
      'pending',
      'passed',
      'waived',
      'failed',
    ]);
  });

  it('REQUIRED_BASE_CHECKS = consent + attribution', () => {
    expect([...REQUIRED_BASE_CHECKS]).toEqual([
      'consent_collected',
      'attribution_verified',
    ]);
  });

  it('SATISFIED_STATUSES = passed + waived', () => {
    expect([...SATISFIED_STATUSES]).toEqual(['passed', 'waived']);
  });
});

describe('asReviewCheckKind', () => {
  it('returns kind on canonical match', () => {
    expect(asReviewCheckKind('legal_reviewed')).toBe('legal_reviewed');
  });
  it('null on bogus', () => {
    expect(asReviewCheckKind('BOGUS')).toBeNull();
    expect(asReviewCheckKind(null)).toBeNull();
    expect(asReviewCheckKind(42)).toBeNull();
  });
});

describe('asReviewCheckStatus', () => {
  it('returns status on canonical match', () => {
    expect(asReviewCheckStatus('passed')).toBe('passed');
  });
  it('null on bogus', () => {
    expect(asReviewCheckStatus('Passed')).toBeNull();
    expect(asReviewCheckStatus(null)).toBeNull();
  });
});

describe('validateReviewCheckNotes', () => {
  it('null / undefined → null', () => {
    expect(validateReviewCheckNotes(null)).toBeNull();
    expect(validateReviewCheckNotes(undefined)).toBeNull();
  });
  it('non-string → error', () => {
    expect(validateReviewCheckNotes(42)).toMatch(/must be a string/);
  });
  it('over-length → error', () => {
    expect(validateReviewCheckNotes('x'.repeat(4_001))).toMatch(
      /4,?000 characters or fewer|4000 characters or fewer/,
    );
  });
  it('short string → null', () => {
    expect(validateReviewCheckNotes('looks good')).toBeNull();
  });
});
