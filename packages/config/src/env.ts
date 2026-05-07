/**
 * @platform/config — Zod-based environment variable validation.
 *
 * Import this module early in your application entry point.
 * It throws at import time when required variables are missing or invalid.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Runtime environment
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid connection URL'),

  // Auth
  AUTH_MODE: z
    .enum(['local', 'oidc'])
    .default('local'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters long'),

  COOKIE_DOMAIN: z.string().optional(),

  // Public URLs
  WEB_PUBLIC_URL: z
    .string()
    .min(1, 'WEB_PUBLIC_URL is required')
    .url('WEB_PUBLIC_URL must be a valid URL'),

  API_PUBLIC_URL: z
    .string()
    .min(1, 'API_PUBLIC_URL is required')
    .url('API_PUBLIC_URL must be a valid URL'),

  // Optional: SMTP (for password reset emails)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_FROM: z.string().email().optional(),

  // Optional: Redis (for distributed rate limiting)
  REDIS_URL: z.string().url().optional(),

  // Optional: Observability
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Validated, typed environment. Throws at import time when env is invalid.
 */
export const env: Env = parseEnv();

export default env;
