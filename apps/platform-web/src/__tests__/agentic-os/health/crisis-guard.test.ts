/**
 * Health OS Phase 1 — `withCrisisGuard` wrapper behavior.
 *
 * Verifies the contract:
 *   - Free-text fields are inspected via `detectCrisisLanguage`.
 *   - Matched fields emit a `crisis-language` risk flag of `critical`
 *     severity via the supplied `persistFlag` callback.
 *   - The wrapper does NOT block the inner handler — handler runs and
 *     its return value is passed through unchanged.
 *   - `persistFlag` failures do not propagate to the caller (graceful).
 */

import { describe, it, expect, vi } from 'vitest';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

interface Body {
  text?: string | null;
  notes?: string | null;
}

describe('withCrisisGuard', () => {
  it('persists a critical crisis-language flag when free text matches', async () => {
    const persistFlag = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ ok: true });

    const result = await withCrisisGuard<Body, { ok: boolean }>(
      { text: 'I want to kill myself', notes: 'unrelated' },
      {
        osSlug: 'health',
        source: 'unit-test',
        extractText: (b) => [b.text, b.notes],
        persistFlag,
      },
      handler,
    );

    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(persistFlag).toHaveBeenCalledTimes(1);
    const flag = persistFlag.mock.calls[0]?.[0];
    expect(flag.kind).toBe('crisis-language');
    expect(flag.severity).toBe('critical');
    expect(flag.source).toBe('unit-test');
  });

  it('does not persist anything when text is benign', async () => {
    const persistFlag = vi.fn();
    const handler = vi.fn().mockResolvedValue('done');
    const result = await withCrisisGuard<Body, string>(
      { text: 'I want to live more peacefully', notes: null },
      {
        osSlug: 'health',
        source: 'unit-test',
        extractText: (b) => [b.text, b.notes],
        persistFlag,
      },
      handler,
    );
    expect(result).toBe('done');
    expect(persistFlag).not.toHaveBeenCalled();
  });

  it('swallows persistence errors so the request still completes', async () => {
    const persistFlag = vi.fn().mockRejectedValue(new Error('db down'));
    const handler = vi.fn().mockResolvedValue('ok');

    const result = await withCrisisGuard<Body, string>(
      { text: 'I want to die' },
      {
        osSlug: 'health',
        source: 'unit-test',
        extractText: (b) => [b.text],
        persistFlag,
      },
      handler,
    );
    expect(result).toBe('ok');
    expect(persistFlag).toHaveBeenCalledTimes(1);
  });

  it('runs the handler even when no free-text fields are provided', async () => {
    const persistFlag = vi.fn();
    const handler = vi.fn().mockResolvedValue('ok');
    const result = await withCrisisGuard<Body, string>(
      {},
      {
        osSlug: 'health',
        source: 'unit-test',
        extractText: () => [],
        persistFlag,
      },
      handler,
    );
    expect(result).toBe('ok');
    expect(persistFlag).not.toHaveBeenCalled();
  });
});
