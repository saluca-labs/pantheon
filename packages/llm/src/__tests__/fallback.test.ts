import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  callLlm,
  registerLlmProvider,
  _resetRegistryForTests,
} from '../index.js';
import type { LlmProvider } from '../types.js';

const T = '11111111-1111-1111-1111-111111111111';

class FailingProvider implements LlmProvider {
  constructor(public readonly name: string) {}
  async call(): Promise<never> {
    throw new Error(`${this.name} failed`);
  }
  async *stream(): AsyncIterable<string> {
    throw new Error(`${this.name} stream failed`);
  }
}

class OkProvider implements LlmProvider {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  async call() {
    return {
      text: this.name,
      promptTokens: 1,
      completionTokens: 1,
      provider: this.name,
      model: 'm',
    };
  }
  async *stream() {
    yield this.name;
  }
}

describe('LLM_PROVIDERS_FALLBACK_ORDER', () => {
  let prev: string | undefined;
  beforeEach(() => {
    _resetRegistryForTests();
    prev = process.env['LLM_PROVIDERS_FALLBACK_ORDER'];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env['LLM_PROVIDERS_FALLBACK_ORDER'];
    else process.env['LLM_PROVIDERS_FALLBACK_ORDER'] = prev;
  });

  it('falls back to next provider on failure', async () => {
    registerLlmProvider({ name: 'primary', adapter: new FailingProvider('primary') });
    registerLlmProvider({ name: 'backup', adapter: new OkProvider('backup') });
    process.env['LLM_PROVIDERS_FALLBACK_ORDER'] = 'backup';
    const r = await callLlm({
      system: 's',
      user: 'u',
      tenantId: T,
      osSlug: 'maker',
      provider: 'primary',
    });
    expect(r).toBe('backup');
  });

  it('throws original error when no fallback configured', async () => {
    registerLlmProvider({ name: 'primary', adapter: new FailingProvider('primary') });
    delete process.env['LLM_PROVIDERS_FALLBACK_ORDER'];
    await expect(
      callLlm({
        system: 's',
        user: 'u',
        tenantId: T,
        osSlug: 'maker',
        provider: 'primary',
      }),
    ).rejects.toThrow(/primary failed/);
  });
});
