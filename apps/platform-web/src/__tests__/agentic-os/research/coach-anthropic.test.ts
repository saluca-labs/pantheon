/**
 * Research OS Phase 7 — coach Anthropic client wrapper tests.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];
const ORIGINAL_MODEL = process.env['COACH_MODEL'];

describe('research coach Anthropic client', () => {
  beforeEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['COACH_MODEL'];
  });

  afterEach(() => {
    if (ORIGINAL_KEY !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (ORIGINAL_MODEL !== undefined) {
      process.env['COACH_MODEL'] = ORIGINAL_MODEL;
    } else {
      delete process.env['COACH_MODEL'];
    }
  });

  it('isCoachConfigured returns false when ANTHROPIC_API_KEY is unset', async () => {
    const { isCoachConfigured } = await import(
      '@/lib/agentic-os/research/coach/anthropic'
    );
    expect(isCoachConfigured()).toBe(false);
  });

  it('isCoachConfigured returns true when ANTHROPIC_API_KEY is set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    const { isCoachConfigured } = await import(
      '@/lib/agentic-os/research/coach/anthropic'
    );
    expect(isCoachConfigured()).toBe(true);
  });

  it('getCoachModelId returns DEFAULT_COACH_MODEL when COACH_MODEL is unset', async () => {
    const { DEFAULT_COACH_MODEL, getCoachModelId } = await import(
      '@/lib/agentic-os/research/coach/anthropic'
    );
    expect(getCoachModelId()).toBe(DEFAULT_COACH_MODEL);
  });

  it('getCoachModelId returns the override when COACH_MODEL is set', async () => {
    process.env['COACH_MODEL'] = 'claude-test-override';
    const { getCoachModelId } = await import(
      '@/lib/agentic-os/research/coach/anthropic'
    );
    expect(getCoachModelId()).toBe('claude-test-override');
  });

  it('callCoachLlm is exported (replaces legacy getAnthropicProvider seam)', async () => {
    const mod = await import('@/lib/agentic-os/research/coach/anthropic');
    expect(typeof mod.callCoachLlm).toBe('function');
  });

  it('DEFAULT_COACH_MODEL matches the platform-wide default', async () => {
    const { DEFAULT_COACH_MODEL } = await import(
      '@/lib/agentic-os/research/coach/anthropic'
    );
    expect(DEFAULT_COACH_MODEL).toBe('claude-sonnet-4-6');
  });
});
