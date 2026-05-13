import { describe, it, expect, beforeEach } from 'vitest';
import { LlmRateLimiter, llmRateLimitKey } from '../rateLimit.js';

describe('LlmRateLimiter', () => {
  let lim: LlmRateLimiter;
  beforeEach(() => {
    lim = new LlmRateLimiter(3, 1000);
  });

  it('builds keys as llm:{tid}:{os_slug}', () => {
    expect(llmRateLimitKey('t1', 'health')).toBe('llm:t1:health');
  });

  it('allows up to capacity then rejects', () => {
    expect(lim.consume('k')).toBe(true);
    expect(lim.consume('k')).toBe(true);
    expect(lim.consume('k')).toBe(true);
    expect(lim.consume('k')).toBe(false);
  });

  it('isolates keys', () => {
    expect(lim.consume('a')).toBe(true);
    expect(lim.consume('a')).toBe(true);
    expect(lim.consume('a')).toBe(true);
    expect(lim.consume('b')).toBe(true);
    expect(lim.consume('a')).toBe(false);
    expect(lim.consume('b')).toBe(true);
  });
});
