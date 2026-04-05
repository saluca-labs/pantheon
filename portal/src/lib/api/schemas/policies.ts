/**
 * Zod schemas for policy-related API responses.
 */

import { z } from "zod";

export const deployKeySchema = z.object({
  id: z.string(),
  key_name: z.string(),
  public_key: z.string(),
  fingerprint: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export const deployKeyListSchema = z.object({
  keys: z.array(deployKeySchema),
});

export type DeployKey = z.infer<typeof deployKeySchema>;
export type DeployKeyList = z.infer<typeof deployKeyListSchema>;
