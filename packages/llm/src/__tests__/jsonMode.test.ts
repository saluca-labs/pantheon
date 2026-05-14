import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  callLlm,
  registerLlmProvider,
  _resetRegistryForTests,
} from '../index.js';
import type { LlmProvider } from '../types.js';

const T = '11111111-1111-1111-1111-111111111111';

class FixedJsonProvider implements LlmProvider {
  readonly name = 'fixedJson';
  constructor(private readonly text: string) {}
  async call() {
    return {
      text: this.text,
      promptTokens: 1,
      completionTokens: 1,
      provider: 'fixedJson',
      model: 'fixed',
    };
  }
  async *stream() {
    yield this.text;
  }
}

describe('jsonMode', () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it('parses JSON and validates against schema', async () => {
    registerLlmProvider({
      name: 'fixedJson',
      adapter: new FixedJsonProvider('{"answer":42}'),
    });
    const r = await callLlm({
      system: 's',
      user: 'u',
      tenantId: T,
      osSlug: 'maker',
      provider: 'fixedJson',
      jsonMode: true,
      schema: z.object({ answer: z.number() }),
    });
    expect(r).toEqual({ answer: 42 });
  });

  it('throws when response is not JSON', async () => {
    registerLlmProvider({
      name: 'fixedJson',
      adapter: new FixedJsonProvider('not json'),
    });
    await expect(
      callLlm({
        system: 's',
        user: 'u',
        tenantId: T,
        osSlug: 'maker',
        provider: 'fixedJson',
        jsonMode: true,
      }),
    ).rejects.toThrow(/valid JSON/);
  });

  it('throws when schema validation fails', async () => {
    registerLlmProvider({
      name: 'fixedJson',
      adapter: new FixedJsonProvider('{"answer":"not-a-number"}'),
    });
    await expect(
      callLlm({
        system: 's',
        user: 'u',
        tenantId: T,
        osSlug: 'maker',
        provider: 'fixedJson',
        jsonMode: true,
        schema: z.object({ answer: z.number() }),
      }),
    ).rejects.toThrow();
  });
});
