/**
 * @platform/observability — Structured logger using pino.
 *
 * Usage:
 *   import { logger } from '@platform/observability';
 *   logger.info({ userId: '...' }, 'User logged in');
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';
const logLevel = process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info');

const options: LoggerOptions = {
  level: logLevel,
  base: {
    service: process.env['SERVICE_NAME'] ?? 'platform',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: structured JSON
        formatters: {
          level(label) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
};

export const logger: Logger = pino(options);

/**
 * Create a child logger with pre-bound context fields.
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
