import { z } from 'zod';

// Mirror of the shape returned by GET /api/llm/models (route.ts) which itself
// reads from the _llm_available_models table populated by the 6h heartbeat
// CronJob at apps/platform-api/k8s/pantheon/cronjobs/llm-models-heartbeat.yaml.
export const llmModelSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  model_id: z.string(),
  display_name: z.string().nullable(),
  context_window: z.number().int().nullable(),
  max_output_tokens: z.number().int().nullable(),
  capabilities: z.record(z.unknown()).default({}),
  pricing: z.record(z.unknown()).default({}),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  deprecated_at: z.string().nullable(),
});

export const llmProviderSummarySchema = z.object({
  count: z.number().int(),
  last_seen_at: z.string().nullable(),
  deprecated_count: z.number().int(),
});

export const llmModelsResponseSchema = z.object({
  models: z.array(llmModelSchema),
  providers: z.record(llmProviderSummarySchema),
  fetched_at: z.string(),
});

export type LlmModel = z.infer<typeof llmModelSchema>;
export type LlmProviderSummary = z.infer<typeof llmProviderSummarySchema>;
export type LlmModelsResponse = z.infer<typeof llmModelsResponseSchema>;
