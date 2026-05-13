/**
 * Maker OS Phase 7 — coach LLM wrapper tests.
 *
 * Wave 0: rewired through `@platform/llm`. The wrapper no longer
 * exposes `getAnthropicProvider`; it exports `callCoachLlm` instead.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];
const ORIGINAL_MODEL = process.env['COACH_MODEL'];

vi.mock('@platform/llm', () => ({
  callLlm: vi.fn(async () => 'stubbed-assistant-reply'),
}));

import {
  DEFAULT_COACH_MODEL,
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/maker/coach/anthropic';
import { callLlm } from '@platform/llm';

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['COACH_MODEL'];
  (callLlm as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  if (ORIGINAL_KEY !== undefined) process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
  if (ORIGINAL_MODEL !== undefined) process.env['COACH_MODEL'] = ORIGINAL_MODEL;
});

describe('isCoachConfigured', () => {
  it('returns false when ANTHROPIC_API_KEY is unset', () => {
    expect(isCoachConfigured()).toBe(false);
  });

  it('returns false when the key is empty string', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    expect(isCoachConfigured()).toBe(false);
  });

  it('returns true when the key is any non-empty string', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    expect(isCoachConfigured()).toBe(true);
  });
});

describe('getCoachModelId', () => {
  it('returns DEFAULT_COACH_MODEL when COACH_MODEL is unset', () => {
    expect(getCoachModelId()).toBe(DEFAULT_COACH_MODEL);
  });

  it('returns the COACH_MODEL override when set', () => {
    process.env['COACH_MODEL'] = 'claude-test-model';
    expect(getCoachModelId()).toBe('claude-test-model');
  });
});

describe('callCoachLlm', () => {
  it('routes the call through @platform/llm with provider=anthropic', async () => {
    const r = await callCoachLlm({
      system: 'sys',
      user: 'hi',
      tenantId: 't-1',
      osSlug: 'maker',
    });
    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'sys',
        user: 'hi',
        tenantId: 't-1',
        osSlug: 'maker',
        provider: 'anthropic',
        model: DEFAULT_COACH_MODEL,
      }),
    );
    expect(r.text).toBe('stubbed-assistant-reply');
  });
});

describe('DEFAULT_COACH_MODEL', () => {
  it('points at a claude-sonnet-* model', () => {
    expect(DEFAULT_COACH_MODEL).toMatch(/^claude-sonnet-/);
  });
});
