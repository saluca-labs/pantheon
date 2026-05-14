import { describe, it, expect, beforeEach } from 'vitest';
import {
  callLlm,
  registerLlmProvider,
  _resetRegistryForTests,
  type LlmProvider,
} from '../index.js';
import { StubLlmProvider } from '../providers/stub.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('stub provider determinism', () => {
  beforeEach(() => {
    _resetRegistryForTests();
    registerLlmProvider({ name: 'stub', adapter: new StubLlmProvider() });
  });

  it('returns identical output for identical (system, user)', async () => {
    const a = await callLlm({
      system: 'You are a helper.',
      user: 'Hello',
      tenantId: TENANT,
      osSlug: 'maker',
      provider: 'stub',
    });
    const b = await callLlm({
      system: 'You are a helper.',
      user: 'Hello',
      tenantId: TENANT,
      osSlug: 'maker',
      provider: 'stub',
    });
    expect(a).toBe(b);
  });

  it('changes output when user differs', async () => {
    const a = await callLlm({
      system: 'sys',
      user: 'A',
      tenantId: TENANT,
      osSlug: 'maker',
      provider: 'stub',
    });
    const b = await callLlm({
      system: 'sys',
      user: 'B',
      tenantId: TENANT,
      osSlug: 'maker',
      provider: 'stub',
    });
    expect(a).not.toBe(b);
  });
});
