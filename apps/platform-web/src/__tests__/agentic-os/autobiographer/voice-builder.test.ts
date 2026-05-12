/**
 * Autobiographer OS — voice profile builder tests.
 *
 * Exercises the two-stage pipeline with a stubbed BuilderClient
 * (test seam): one mock per stage capturing call shape, plus a
 * sample-mass invariant the LLM never gets to override.
 *
 * Also covers the configured/unconfigured branch and the
 * `no_samples` typed error.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VoiceSampleBuilderInput } from '@/lib/agentic-os/autobiographer/voice-samples-repo';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];

import {
  VoiceBuilderError,
  buildVoiceProfile,
  type BuilderClient,
  type ProfileAggregate,
  type SampleAnalysis,
} from '@/lib/agentic-os/autobiographer/voice/builder';

function makeStubClient(): {
  client: BuilderClient;
  analyzeSampleMock: ReturnType<typeof vi.fn>;
  aggregateMock: ReturnType<typeof vi.fn>;
} {
  const analyzeSampleMock = vi.fn(
    async ({ body }: { body: string; title: string | null }): Promise<SampleAnalysis> => ({
      tone: `tone-${body.slice(0, 3)}`,
      sentence_structure: 'short',
      vocabulary: 'plain',
      pacing: 'steady',
      pov: 'first',
      imagery: 'sparse',
      dialogue_usage: 'rare',
      paragraph_structure: 'tight',
      style_adjectives: ['warm', 'observational'],
    }),
  );
  const aggregateMock = vi.fn(
    async ({ analyses }: { analyses: SampleAnalysis[] }): Promise<ProfileAggregate> => ({
      style_summary:
        'The voice is warm and observational across all the provided samples.',
      style_rules: ['Use short sentences', 'Prefer concrete nouns'],
      style_adjectives: analyses.flatMap((a) => a.style_adjectives),
      example_openings: ['Once, on a Tuesday,'],
    }),
  );
  const client: BuilderClient = {
    analyzeSample: analyzeSampleMock,
    aggregate: aggregateMock,
  };
  return { client, analyzeSampleMock, aggregateMock };
}

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
});

afterEach(() => {
  if (ORIGINAL_KEY !== undefined) {
    process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
  }
});

function makeSample(over: Partial<VoiceSampleBuilderInput> = {}): VoiceSampleBuilderInput {
  return {
    id: 's-1',
    title: null,
    bodyText: 'One Tuesday I sat down to write.',
    wordCount: 7,
    memoryId: null,
    ...over,
  };
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('buildVoiceProfile — happy path', () => {
  it('runs analyzeSample once per sample then aggregate once', async () => {
    const { client, analyzeSampleMock, aggregateMock } = makeStubClient();
    const samples = [
      makeSample({ id: 's-1', wordCount: 50 }),
      makeSample({ id: 's-2', wordCount: 80, bodyText: 'Two body words.' }),
    ];

    await buildVoiceProfile({
      samples,
      builderAttribution: 'test-session',
      client,
    });

    expect(analyzeSampleMock).toHaveBeenCalledTimes(2);
    expect(aggregateMock).toHaveBeenCalledTimes(1);
  });

  it('forwards title to analyzeSample', async () => {
    const { client, analyzeSampleMock } = makeStubClient();
    await buildVoiceProfile({
      samples: [makeSample({ title: 'Tuesday' })],
      builderAttribution: 'test',
      client,
    });
    expect(analyzeSampleMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tuesday' }),
    );
  });

  it('sample_count + sample_word_count are computed locally, not from LLM', async () => {
    const { client } = makeStubClient();
    const built = await buildVoiceProfile({
      samples: [
        makeSample({ wordCount: 100 }),
        makeSample({ id: 's-2', wordCount: 250 }),
        makeSample({ id: 's-3', wordCount: 50 }),
      ],
      builderAttribution: 'test',
      client,
    });
    expect(built.sampleCount).toBe(3);
    expect(built.sampleWordCount).toBe(400);
  });

  it('builderAttribution is passed through verbatim', async () => {
    const { client } = makeStubClient();
    const built = await buildVoiceProfile({
      samples: [makeSample()],
      builderAttribution: 'coach-session-abc-123',
      client,
    });
    expect(built.builder).toBe('coach-session-abc-123');
  });

  it('normalizes adjectives across samples (dedupe case-insensitively)', async () => {
    const { client } = makeStubClient();
    // The stub aggregator returns the flattened adjectives — make sure
    // the builder dedupes them.
    const built = await buildVoiceProfile({
      samples: [makeSample(), makeSample({ id: 's-2' })],
      builderAttribution: 'test',
      client,
    });
    // After flatMap we'd have ['warm','observational','warm','observational'],
    // normalized to ['warm','observational'].
    expect(built.styleAdjectives).toEqual(['warm', 'observational']);
  });

  it('passes through the aggregate styleSummary verbatim', async () => {
    const { client } = makeStubClient();
    const built = await buildVoiceProfile({
      samples: [makeSample()],
      builderAttribution: 'test',
      client,
    });
    expect(built.styleSummary).toMatch(/warm and observational/i);
  });

  it('runs analyzeSample concurrently (Promise.all)', async () => {
    const order: string[] = [];
    const client: BuilderClient = {
      analyzeSample: vi.fn(async ({ body }) => {
        order.push(`start:${body[0]}`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`end:${body[0]}`);
        return {
          tone: 't',
          sentence_structure: 's',
          vocabulary: 'v',
          pacing: 'p',
          pov: 'first',
          imagery: 'i',
          dialogue_usage: 'd',
          paragraph_structure: 'pa',
          style_adjectives: ['warm'],
        };
      }),
      aggregate: vi.fn(async () => ({
        style_summary: 'long enough style summary value here for validation',
        style_rules: ['rule'],
        style_adjectives: ['warm'],
        example_openings: ['o'],
      })),
    };

    await buildVoiceProfile({
      samples: [
        makeSample({ bodyText: 'A first' }),
        makeSample({ id: 's-2', bodyText: 'B second' }),
      ],
      builderAttribution: 'test',
      client,
    });
    // Both should have started before either ended.
    const startA = order.indexOf('start:A');
    const startB = order.indexOf('start:B');
    const endA = order.indexOf('end:A');
    expect(startA).toBeLessThan(endA);
    expect(startB).toBeLessThan(endA);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('buildVoiceProfile — edge cases', () => {
  it('throws VoiceBuilderError(no_samples) on empty input', async () => {
    const { client } = makeStubClient();
    await expect(
      buildVoiceProfile({
        samples: [],
        builderAttribution: 'test',
        client,
      }),
    ).rejects.toBeInstanceOf(VoiceBuilderError);
    await expect(
      buildVoiceProfile({
        samples: [],
        builderAttribution: 'test',
        client,
      }),
    ).rejects.toMatchObject({ code: 'no_samples' });
  });

  it('works with a single sample (no minimum > 1)', async () => {
    const { client } = makeStubClient();
    const built = await buildVoiceProfile({
      samples: [makeSample({ wordCount: 42 })],
      builderAttribution: 'test',
      client,
    });
    expect(built.sampleCount).toBe(1);
    expect(built.sampleWordCount).toBe(42);
  });

  it('throws coach_not_configured when no client is supplied + no API key', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    await expect(
      buildVoiceProfile({
        samples: [makeSample()],
        builderAttribution: 'test',
      }),
    ).rejects.toMatchObject({ code: 'coach_not_configured' });
  });
});
