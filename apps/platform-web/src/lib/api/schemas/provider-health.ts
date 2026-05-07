import { z } from 'zod';

export const providerStatusSchema = z.object({
  name: z.string(),
  is_healthy: z.boolean(),
  consecutive_errors: z.number().int().min(0),
  status: z.enum(['up', 'degraded', 'down']),
});

export const providerHealthResponseSchema = z.object({
  cascade: z.array(z.string()),
  providers: z.array(providerStatusSchema),
});

export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type ProviderHealthResponse = z.infer<typeof providerHealthResponseSchema>;
