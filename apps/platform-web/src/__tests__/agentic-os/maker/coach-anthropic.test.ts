/**
 * Maker OS Phase 7 — coach Anthropic provider wrapper tests.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];
const ORIGINAL_MODEL = process.env['COACH_MODEL'];

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn((opts: any) => ({
    _opts: opts,
    _stub: true,
  })),
}));

import {
  DEFAULT_COACH_MODEL,
  getAnthropicProvider,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/maker/coach/anthropic';
import { createAnthropic } from '@ai-sdk/anthropic';

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['COACH_MODEL'];
  (createAnthropic as unknown as ReturnType<typeof vi.fn>).mockClear();
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

describe('getAnthropicProvider', () => {
  it('throws when ANTHROPIC_API_KEY is unset', () => {
    expect(() => getAnthropicProvider()).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('calls createAnthropic with the key when configured', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    getAnthropicProvider();
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' });
  });
});

describe('DEFAULT_COACH_MODEL', () => {
  it('points at a claude-sonnet-* model', () => {
    expect(DEFAULT_COACH_MODEL).toMatch(/^claude-sonnet-/);
  });
});
