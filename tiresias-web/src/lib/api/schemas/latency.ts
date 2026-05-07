import { z } from 'zod';

export const latencyEntrySchema = z.object({
  provider: z.string(),
  sample_count: z.number().int(),
  p50_ms: z.number(),
  p95_ms: z.number(),
  p99_ms: z.number(),
});

export const latencyResponseSchema = z.array(latencyEntrySchema);

export type LatencyEntry = z.infer<typeof latencyEntrySchema>;
export type LatencyResponse = z.infer<typeof latencyResponseSchema>;
