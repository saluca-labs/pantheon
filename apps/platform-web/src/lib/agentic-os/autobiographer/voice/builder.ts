/**
 * Autobiographer OS — Voice profile builder.
 *
 * Two-stage prompt chain from the legacy doc, executed against the
 * shared Anthropic provider used by every per-OS coach:
 *
 *   1. **Per-sample style analysis** — one `generateObject` call per
 *      sample. Extracts tone, sentence structure, vocabulary, pacing,
 *      POV, imagery, dialogue usage, paragraph structure, and a list
 *      of style adjectives.
 *
 *   2. **Multi-sample aggregation** — one `generateObject` call that
 *      merges the per-sample analyses into a unified profile:
 *      `style_summary` (3-6 sentences), `style_rules` (imperatives),
 *      `style_adjectives` (deduped union), `example_openings` (3-5
 *      short openings drawn verbatim from inputs).
 *
 * The builder returns a *deterministic, normalized* profile object so
 * the route layer can hand it directly to `insertVoiceProfile`. Math
 * for `sample_count` + `sample_word_count` is done here (not the LLM)
 * so the persisted row matches the actual input mass to the byte.
 *
 * Test seam — the route layer dependency-injects a `client` adapter
 * with stages `analyzeSample` and `aggregate`; the default adapter
 * dispatches to Anthropic via `@ai-sdk/anthropic` + `ai`'s
 * `generateObject`. Unit tests pass a deterministic stub adapter.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { z } from 'zod';
import { generateObject } from 'ai';
import type { VoiceSampleBuilderInput } from '../voice-samples-repo';
import {
  EXAMPLE_OPENINGS_MAX,
  STYLE_ADJECTIVE_MAX,
  STYLE_RULES_MAX,
  normalizeExampleOpenings,
  normalizeStyleAdjectives,
  normalizeStyleRules,
} from '../voice-profiles';
import {
  getVoiceBuilderModelId,
  getVoiceBuilderProvider,
  isVoiceBuilderConfigured,
} from './anthropic';

// ─── Zod schemas for stage outputs ───────────────────────────────────────────

const SampleAnalysisSchema = z.object({
  tone: z.string().min(1).max(400),
  sentence_structure: z.string().min(1).max(400),
  vocabulary: z.string().min(1).max(400),
  pacing: z.string().min(1).max(400),
  pov: z.string().min(1).max(200),
  imagery: z.string().min(1).max(400),
  dialogue_usage: z.string().min(1).max(400),
  paragraph_structure: z.string().min(1).max(400),
  style_adjectives: z
    .array(z.string().min(1).max(40))
    .min(1)
    .max(20),
});

export type SampleAnalysis = z.infer<typeof SampleAnalysisSchema>;

const ProfileAggregateSchema = z.object({
  style_summary: z.string().min(20).max(4000),
  style_rules: z.array(z.string().min(2).max(240)).min(1).max(STYLE_RULES_MAX),
  style_adjectives: z
    .array(z.string().min(1).max(40))
    .min(1)
    .max(STYLE_ADJECTIVE_MAX),
  example_openings: z
    .array(z.string().min(1).max(600))
    .min(1)
    .max(EXAMPLE_OPENINGS_MAX),
});

export type ProfileAggregate = z.infer<typeof ProfileAggregateSchema>;

// ─── Prompts (locked for now; future iterations can A/B via metadata) ────────

const ANALYZE_SYSTEM_PROMPT = `You are a literary style analyst. Given a single
prose sample from a user, extract structured style markers. Output JSON only —
no prose. Be terse and observational; do not evaluate quality.

Keys:
  tone                 — emotional register (e.g. "warm, conversational")
  sentence_structure   — typical sentence length and complexity
  vocabulary           — register, density, common-word vs ornate
  pacing               — fast, deliberate, contemplative
  pov                  — first / second / third / mixed
  imagery              — visual, sensory, abstract; how often
  dialogue_usage       — present, frequency, embedded vs called-out
  paragraph_structure  — paragraph length, indentation cadence
  style_adjectives     — 5-12 single-word descriptors of the voice`;

const AGGREGATE_SYSTEM_PROMPT = `You are a literary style aggregator. Given a
list of per-sample style analyses from one author, produce a unified voice
profile. Output JSON only.

Keys:
  style_summary     — 3-6 sentence prose description of the voice
  style_rules       — array of imperative sentences ("Use short sentences",
                      "Prefer concrete nouns") that a ghostwriter could follow
  style_adjectives  — deduped union of single-word descriptors across samples
  example_openings  — 3-5 short opening phrases drawn VERBATIM from the input
                      samples (no paraphrasing, no editorialization)

Be specific and actionable; avoid generic "the writer is thoughtful" filler.`;

// ─── Builder adapter (test seam) ─────────────────────────────────────────────

export interface BuilderClient {
  /** Analyze a single sample. Stage 1 of the chain. */
  analyzeSample(input: { body: string; title: string | null }): Promise<SampleAnalysis>;
  /** Aggregate per-sample analyses + raw openings into a profile. Stage 2. */
  aggregate(input: {
    analyses: SampleAnalysis[];
    rawSamples: { title: string | null; body: string }[];
  }): Promise<ProfileAggregate>;
}

/**
 * Default builder client backed by Anthropic via `@ai-sdk/anthropic`.
 * Uses `generateObject` for both stages so we get schema-validated
 * JSON without parsing string output ourselves.
 */
export function makeAnthropicBuilderClient(): BuilderClient {
  const provider = getVoiceBuilderProvider();
  const modelId = getVoiceBuilderModelId();
  return {
    async analyzeSample({ body, title }) {
      const prompt = title
        ? `Title: ${title}\n\nSample:\n${body}`
        : `Sample:\n${body}`;
      const result = await generateObject({
        model: provider(modelId),
        schema: SampleAnalysisSchema,
        system: ANALYZE_SYSTEM_PROMPT,
        prompt,
      });
      return result.object;
    },
    async aggregate({ analyses, rawSamples }) {
      const analysesBlock = analyses
        .map(
          (a, i) =>
            `--- Sample ${i + 1} ---\n` +
            `tone: ${a.tone}\n` +
            `sentence_structure: ${a.sentence_structure}\n` +
            `vocabulary: ${a.vocabulary}\n` +
            `pacing: ${a.pacing}\n` +
            `pov: ${a.pov}\n` +
            `imagery: ${a.imagery}\n` +
            `dialogue_usage: ${a.dialogue_usage}\n` +
            `paragraph_structure: ${a.paragraph_structure}\n` +
            `style_adjectives: ${a.style_adjectives.join(', ')}`,
        )
        .join('\n\n');
      const openingsBlock = rawSamples
        .map((s, i) => `--- Opening ${i + 1} ---\n${s.body.slice(0, 600)}`)
        .join('\n\n');
      const prompt =
        `Per-sample analyses:\n\n${analysesBlock}\n\n` +
        `Raw sample openings (for verbatim example_openings selection):\n\n${openingsBlock}`;
      const result = await generateObject({
        model: provider(modelId),
        schema: ProfileAggregateSchema,
        system: AGGREGATE_SYSTEM_PROMPT,
        prompt,
      });
      return result.object;
    },
  };
}

// ─── Builder entry point ─────────────────────────────────────────────────────

export interface BuildVoiceProfileInput {
  samples: VoiceSampleBuilderInput[];
  /** Free-form attribution string written to `builder` column. */
  builderAttribution: string;
  /** Optional override; otherwise the default Anthropic client is used. */
  client?: BuilderClient;
}

export interface BuiltVoiceProfile {
  styleSummary: string;
  styleAdjectives: string[];
  styleRules: string[];
  exampleOpenings: string[];
  sampleCount: number;
  sampleWordCount: number;
  builder: string;
}

export class VoiceBuilderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'VoiceBuilderError';
  }
}

/**
 * Run the two-stage builder against the supplied samples.
 *
 * Throws `VoiceBuilderError('no_samples')` if `samples` is empty —
 * route handlers surface that as a 400 with an actionable message.
 *
 * If no `client` is supplied and `ANTHROPIC_API_KEY` is missing,
 * throws `VoiceBuilderError('coach_not_configured')` so the route can
 * map it to a 503.
 */
export async function buildVoiceProfile(
  input: BuildVoiceProfileInput,
): Promise<BuiltVoiceProfile> {
  if (!input.samples || input.samples.length === 0) {
    throw new VoiceBuilderError(
      'no_samples',
      'At least one active voice sample is required to build a profile.',
    );
  }

  let client: BuilderClient;
  if (input.client) {
    client = input.client;
  } else {
    if (!isVoiceBuilderConfigured()) {
      throw new VoiceBuilderError(
        'coach_not_configured',
        'Voice builder is not yet configured — admin needs to set ANTHROPIC_API_KEY.',
      );
    }
    client = makeAnthropicBuilderClient();
  }

  // Stage 1 — per-sample analyses. Run in parallel so a 5-sample build
  // doesn't take 5× the latency of one. The provider rate-limits us
  // naturally; we don't add a semaphore here.
  const analyses = await Promise.all(
    input.samples.map((s) =>
      client.analyzeSample({ body: s.bodyText, title: s.title }),
    ),
  );

  // Stage 2 — aggregate.
  const aggregate = await client.aggregate({
    analyses,
    rawSamples: input.samples.map((s) => ({
      title: s.title,
      body: s.bodyText,
    })),
  });

  // Math is done locally so the persisted row matches actual input mass
  // exactly. The LLM's `style_adjectives` are passed through the
  // canonical normalizer to defend against case-collisions and over-cap
  // outputs.
  const sampleCount = input.samples.length;
  const sampleWordCount = input.samples.reduce(
    (acc, s) => acc + (s.wordCount || 0),
    0,
  );

  return {
    styleSummary: aggregate.style_summary,
    styleAdjectives: normalizeStyleAdjectives(aggregate.style_adjectives),
    styleRules: normalizeStyleRules(aggregate.style_rules),
    exampleOpenings: normalizeExampleOpenings(aggregate.example_openings),
    sampleCount,
    sampleWordCount,
    builder: input.builderAttribution,
  };
}
