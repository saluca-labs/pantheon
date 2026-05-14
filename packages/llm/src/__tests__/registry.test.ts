import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLlmProvider,
  getLlmProvider,
  listLlmProviders,
  _resetRegistryForTests,
} from '../registry.js';
import type { LlmProvider } from '../types.js';

class P implements LlmProvider {
  constructor(public readonly name: string) {}
  async call() {
    return { text: this.name, promptTokens: 0, completionTokens: 0, provider: this.name, model: 'm' };
  }
  async *stream() {
    yield this.name;
  }
}

describe('registerLlmProvider — extensibility', () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it('registers and retrieves a provider', () => {
    registerLlmProvider({ name: 'vllm', adapter: new P('vllm') });
    expect(getLlmProvider('vllm')?.name).toBe('vllm');
  });

  it('rejects an adapter missing required methods', () => {
    expect(() =>
      registerLlmProvider({
        name: 'broken',
        // @ts-expect-error testing runtime guard
        adapter: { name: 'broken' },
      }),
    ).toThrow();
  });

  it('listLlmProviders is sorted', () => {
    registerLlmProvider({ name: 'b', adapter: new P('b') });
    registerLlmProvider({ name: 'a', adapter: new P('a') });
    expect(listLlmProviders()).toEqual(['a', 'b']);
  });
});
