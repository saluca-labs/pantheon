import { describe, it, expect } from 'vitest';
import { providerHealthResponseSchema } from '@/lib/api/schemas/provider-health';

const BACKEND_URL = process.env.TIRESIAS_API_URL || 'http://localhost:8900';
const API_KEY = process.env.TIRESIAS_API_KEY || 'test-api-key';

describe('Contract: GET /dash/v1/providers/health', () => {
  it('response matches providerHealthResponseSchema', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/providers/health`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const result = providerHealthResponseSchema.safeParse(data);

    if (!result.success) {
      console.error('Contract violation:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('cascade field is a non-empty array of provider names', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/providers/health`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    const data = await res.json();
    expect(Array.isArray(data.cascade)).toBe(true);
    expect(data.cascade.length).toBeGreaterThan(0);
    expect(typeof data.cascade[0]).toBe('string');
  });

  it('each provider has a valid status enum value', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/providers/health`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    const data = await res.json();
    for (const provider of data.providers) {
      expect(['up', 'degraded', 'down']).toContain(provider.status);
    }
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/providers/health`);
    expect(res.status).toBe(401);
  });
});
