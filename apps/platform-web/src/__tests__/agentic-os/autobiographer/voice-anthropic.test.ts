/**
 * Autobiographer OS Phase 3 — voice builder Anthropic provider wrapper.
 *
 * Mirrors the per-OS coach Anthropic-wrapper test (Maker / Health /
 * Filmmaker / Cyber). Mocks `@ai-sdk/anthropic` so the wrapper's
 * configuration toggle + model-id resolution + provider construction
 * are tested in isolation.
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

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];
const ORIGINAL_VOICE_MODEL = process.env['VOICE_BUILDER_MODEL'];
const ORIGINAL_COACH_MODEL = process.env['COACH_MODEL'];

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn((opts: any) => ({
    _opts: opts,
    _stub: true,
  })),
}));

import {
  DEFAULT_VOICE_BUILDER_MODEL,
  getVoiceBuilderModelId,
  getVoiceBuilderProvider,
  isVoiceBuilderConfigured,
} from '@/lib/agentic-os/autobiographer/voice/anthropic';
import { createAnthropic } from '@ai-sdk/anthropic';

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['VOICE_BUILDER_MODEL'];
  delete process.env['COACH_MODEL'];
  (createAnthropic as unknown as ReturnType<typeof vi.fn>).mockClear();
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

describe('getVoiceBuilderProvider', () => {
  it('throws when ANTHROPIC_API_KEY is unset', () => {
    expect(() => getVoiceBuilderProvider()).toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
  });

  it('calls createAnthropic with the key when configured', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    getVoiceBuilderProvider();
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' });
  });
});

describe('DEFAULT_VOICE_BUILDER_MODEL', () => {
  it('points at a claude-sonnet-* model', () => {
    expect(DEFAULT_VOICE_BUILDER_MODEL).toMatch(/^claude-sonnet-/);
  });
});
