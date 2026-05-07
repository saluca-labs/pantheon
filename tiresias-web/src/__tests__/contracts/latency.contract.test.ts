import { describe, it, expect } from 'vitest';
import { latencyResponseSchema } from '@/lib/api/schemas/latency';

const BACKEND_URL = process.env.TIRESIAS_API_URL || 'http://localhost:8900';
const API_KEY = process.env.TIRESIAS_API_KEY || 'test-api-key';

describe('Contract: GET /dash/v1/latency', () => {
  it('response matches latencyResponseSchema', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/latency`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const result = latencyResponseSchema.safeParse(data);

    if (!result.success) {
      console.error('Contract violation:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('accepts start and end query parameters', async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const end = now.toISOString();
    const res = await fetch(
      `${BACKEND_URL}/dash/v1/latency?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: { 'X-Tiresias-Api-Key': API_KEY } },
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    const result = latencyResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('latency entries have non-negative percentile values', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/latency`, {
      headers: { 'X-Tiresias-Api-Key': API_KEY },
    });
    const data = await res.json();
    for (const entry of data) {
      expect(entry.p50_ms).toBeGreaterThanOrEqual(0);
      expect(entry.p95_ms).toBeGreaterThanOrEqual(0);
      expect(entry.p99_ms).toBeGreaterThanOrEqual(0);
      expect(entry.p95_ms).toBeGreaterThanOrEqual(entry.p50_ms);
      expect(entry.p99_ms).toBeGreaterThanOrEqual(entry.p95_ms);
    }
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${BACKEND_URL}/dash/v1/latency`);
    expect(res.status).toBe(401);
  });
});
