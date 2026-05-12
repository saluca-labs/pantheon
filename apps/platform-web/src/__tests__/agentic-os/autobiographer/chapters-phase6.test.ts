/**
 * Autobiographer OS — Phase 6 chapters domain helpers.
 *
 * `computeRequiredCheckKinds` is the pure helper the lock route uses
 * to decide whether `sensitive_flagged` joins the required set.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import { computeRequiredCheckKinds } from '@/lib/agentic-os/autobiographer/chapters';

describe('computeRequiredCheckKinds', () => {
  it('base set is consent + attribution', () => {
    expect(
      computeRequiredCheckKinds({ hasSensitiveContent: false }),
    ).toEqual(['consent_collected', 'attribution_verified']);
  });

  it('adds sensitive_flagged when hasSensitiveContent=true', () => {
    expect(
      computeRequiredCheckKinds({ hasSensitiveContent: true }),
    ).toEqual([
      'consent_collected',
      'attribution_verified',
      'sensitive_flagged',
    ]);
  });
});
