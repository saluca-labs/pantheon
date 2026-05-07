import { describe, it, expect } from 'vitest';
import { errorRatesResponseSchema } from '@/lib/api/schemas/errors';

const BACKEND_URL = process.env.TIRESIAS_API_URL || 'http://localhost:8900';
const API_KEY = process.env.TIRESIAS_API_KEY || 'test-api-key';

describe('Contract: GET /dash/v1/errors', () => {
  it('response matches errorRatesResponseSchema', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/errors`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const result = errorRatesResponseSchema.safeParse(data);

    if (!result.success) {
      console.error('Contract violation:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('error_rate is between 0 and 1 inclusive', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/errors`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    const data = await res.json();
    for (const entry of data) {
      expect(entry.error_rate).toBeGreaterThanOrEqual(0);
      expect(entry.error_rate).toBeLessThanOrEqual(1);
    }
  });

  it('status_codes is a record of string keys to integer values', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/errors`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    const data = await res.json();
    for (const entry of data) {
      if (entry.status_codes && Object.keys(entry.status_codes).length > 0) {
        for (const [code, count] of Object.entries(entry.status_codes)) {
          expect(typeof code).toBe('string');
          expect(Number.isInteger(count)).toBe(true);
        }
      }
    }
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/errors`);
    expect(res.status).toBe(401);
  });
});
