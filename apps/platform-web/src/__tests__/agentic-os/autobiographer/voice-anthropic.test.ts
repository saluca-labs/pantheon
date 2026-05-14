/**
 * Autobiographer OS Phase 3 — voice builder LLM wrapper tests.
 *
 * Wave 0: rewired through `@platform/llm`. The wrapper no longer
 * exposes `getVoiceBuilderProvider`; it exports `callVoiceBuilderJson`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { z } from 'zod';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];
const ORIGINAL_VOICE_MODEL = process.env['VOICE_BUILDER_MODEL'];
const ORIGINAL_COACH_MODEL = process.env['COACH_MODEL'];

vi.mock('@platform/llm', () => ({
  callLlm: vi.fn(async () => ({ answer: 'stubbed' })),
}));

import {
  DEFAULT_VOICE_BUILDER_MODEL,
  callVoiceBuilderJson,
  getVoiceBuilderModelId,
  isVoiceBuilderConfigured,
} from '@/lib/agentic-os/autobiographer/voice/anthropic';
import { callLlm } from '@platform/llm';

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['VOICE_BUILDER_MODEL'];
  delete process.env['COACH_MODEL'];
  (callLlm as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  if (ORIGINAL_KEY !== undefined) process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
  if (ORIGINAL_VOICE_MODEL !== undefined)
    process.env['VOICE_BUILDER_MODEL'] = ORIGINAL_VOICE_MODEL;
  if (ORIGINAL_COACH_MODEL !== undefined)
    process.env['COACH_MODEL'] = ORIGINAL_COACH_MODEL;
});

describe('isVoiceBuilderConfigured', () => {
  it('returns false when ANTHROPIC_API_KEY is unset', () => {
    expect(isVoiceBuilderConfigured()).toBe(false);
  });

  it('returns false when the key is empty string', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    expect(isVoiceBuilderConfigured()).toBe(false);
  });

  it('returns true when the key is any non-empty string', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    expect(isVoiceBuilderConfigured()).toBe(true);
  });
});

describe('getVoiceBuilderModelId', () => {
  it('returns DEFAULT_VOICE_BUILDER_MODEL when no override is set', () => {
    expect(getVoiceBuilderModelId()).toBe(DEFAULT_VOICE_BUILDER_MODEL);
  });

  it('prefers VOICE_BUILDER_MODEL over COACH_MODEL', () => {
    process.env['VOICE_BUILDER_MODEL'] = 'claude-voice-builder';
    process.env['COACH_MODEL'] = 'claude-generic-coach';
    expect(getVoiceBuilderModelId()).toBe('claude-voice-builder');
  });

  it('falls back to COACH_MODEL when VOICE_BUILDER_MODEL is unset', () => {
    process.env['COACH_MODEL'] = 'claude-generic-coach';
    expect(getVoiceBuilderModelId()).toBe('claude-generic-coach');
  });
});

describe('callVoiceBuilderJson', () => {
  it('routes through @platform/llm with jsonMode + schema + provider=anthropic', async () => {
    const schema = z.object({ answer: z.string() });
    const r = await callVoiceBuilderJson({
      system: 'sys',
      user: 'u',
      schema,
      tenantId: 't-1',
    });
    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'sys',
        user: 'u',
        tenantId: 't-1',
        osSlug: 'autobiographer',
        provider: 'anthropic',
        jsonMode: true,
        schema,
        model: DEFAULT_VOICE_BUILDER_MODEL,
      }),
    );
    expect(r).toEqual({ answer: 'stubbed' });
  });
});

describe('DEFAULT_VOICE_BUILDER_MODEL', () => {
  it('points at a claude-sonnet-* model', () => {
    expect(DEFAULT_VOICE_BUILDER_MODEL).toMatch(/^claude-sonnet-/);
  });
});
