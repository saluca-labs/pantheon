import { z } from 'zod';

export const errorRateEntrySchema = z.object({
  provider: z.string(),
  total_requests: z.number().int(),
  error_count: z.number().int(),
  error_rate: z.number().min(0).max(1),
  status_codes: z.record(z.string(), z.number().int()),
});

export const errorRatesResponseSchema = z.array(errorRateEntrySchema);

export type ErrorRateEntry = z.infer<typeof errorRateEntrySchema>;
export type ErrorRatesResponse = z.infer<typeof errorRatesResponseSchema>;
