import { describe, it, expect } from 'vitest';
import {
  scoreScreener,
  getScreener,
  PHQ9,
  GAD7,
  CRISIS_RESOURCES,
} from '@/lib/agentic-os/health/screeners';

describe('PHQ-9 scoring', () => {
  it('scores all-zero answers as minimal with no crisis flag', () => {
    const r = scoreScreener('phq9', new Array(9).fill(0));
    expect(r.score).toBe(0);
    expect(r.severity).toBe('minimal');
    expect(r.crisisFlag).toBe(false);
  });

  it('scores all-3 answers as severe and flags crisis', () => {
    const r = scoreScreener('phq9', new Array(9).fill(3));
    expect(r.score).toBe(27);
    expect(r.severity).toBe('severe');
    expect(r.crisisFlag).toBe(true);
  });

  it('flags crisis when item 9 is non-zero, even on a low total', () => {
    const answers = new Array(9).fill(0);
    answers[8] = 1;
    const r = scoreScreener('phq9', answers);
    expect(r.score).toBe(1);
    expect(r.severity).toBe('minimal');
    expect(r.crisisFlag).toBe(true);
  });

  it('uses correct severity cutoffs', () => {
    // 5 = mild
    expect(scoreScreener('phq9', [1, 1, 1, 1, 1, 0, 0, 0, 0]).severity).toBe('mild');
    // 10 = moderate
    expect(scoreScreener('phq9', [2, 2, 2, 2, 2, 0, 0, 0, 0]).severity).toBe('moderate');
    // 15 = moderately_severe
    expect(scoreScreener('phq9', [3, 3, 3, 3, 3, 0, 0, 0, 0]).severity).toBe('moderately_severe');
    // 20 = severe
    expect(scoreScreener('phq9', [3, 3, 3, 3, 3, 3, 2, 0, 0]).severity).toBe('severe');
  });

  it('rejects malformed input', () => {
    expect(() => scoreScreener('phq9', [0, 0, 0])).toThrow();
    expect(() => scoreScreener('phq9', [0, 0, 0, 0, 0, 0, 0, 0, 4])).toThrow();
    expect(() => scoreScreener('phq9', [0, 0, 0, 0, 0, 0, 0, 0, -1])).toThrow();
  });
});

describe('GAD-7 scoring', () => {
  it('scores all-zero as minimal', () => {
    const r = scoreScreener('gad7', new Array(7).fill(0));
    expect(r.score).toBe(0);
    expect(r.severity).toBe('minimal');
    expect(r.crisisFlag).toBe(false);
  });

  it('uses correct severity cutoffs', () => {
    expect(scoreScreener('gad7', [1, 1, 1, 1, 1, 0, 0]).severity).toBe('mild'); // 5
    expect(scoreScreener('gad7', [2, 2, 2, 2, 2, 0, 0]).severity).toBe('moderate'); // 10
    expect(scoreScreener('gad7', [3, 3, 3, 3, 3, 1, 0]).severity).toBe('severe'); // 16
  });

  it('does not crisis-flag GAD-7 (no crisis item)', () => {
    const r = scoreScreener('gad7', new Array(7).fill(3));
    expect(r.score).toBe(21);
    expect(r.severity).toBe('severe');
    expect(r.crisisFlag).toBe(false);
  });
});

describe('getScreener', () => {
  it('returns PHQ-9 / GAD-7 by key', () => {
    expect(getScreener('phq9')).toBe(PHQ9);
    expect(getScreener('gad7')).toBe(GAD7);
  });
  it('returns null for unknown screeners', () => {
    expect(getScreener('pss')).toBeNull();
    expect(getScreener('')).toBeNull();
  });
});

describe('Crisis resources surface 988 and Crisis Text Line', () => {
  it('uses the published phone number and text shortcode', () => {
    expect(CRISIS_RESOURCES.hotlineNumber).toBe('988');
    expect(CRISIS_RESOURCES.textShortcode).toBe('741741');
    expect(CRISIS_RESOURCES.textKeyword).toBe('HOME');
  });
});
