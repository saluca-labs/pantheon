/**
 * Autobiographer OS — arc-chapters domain tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import { validatePosition } from '@/lib/agentic-os/autobiographer/arc-chapters';

describe('validatePosition', () => {
  it('rejects negative', () => {
    expect(validatePosition(-1)).toMatch(/non-negative/);
  });
  it('rejects non-integer', () => {
    expect(validatePosition(1.5)).toMatch(/integer/i);
    expect(validatePosition('5')).toMatch(/integer/i);
    expect(validatePosition(NaN)).toMatch(/integer/i);
  });
  it('accepts 0 and positive ints', () => {
    expect(validatePosition(0)).toBeNull();
    expect(validatePosition(1)).toBeNull();
    expect(validatePosition(99)).toBeNull();
  });
});
