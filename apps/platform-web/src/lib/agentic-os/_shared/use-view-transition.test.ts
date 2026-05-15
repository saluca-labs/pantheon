/**
 * Wave E.3 — useViewTransition hook behavior tests.
 *
 * Covers: graceful fallback when `document.startViewTransition` is
 * unavailable (jsdom default), routing through `startViewTransition`
 * when it exists, callable identity stability across renders.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewTransition } from './use-view-transition';

describe('useViewTransition', () => {
  afterEach(() => {
    // Clean up the polyfill we install in the "supported" tests.
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
  });

  it('returns a stable callable across renders', () => {
    const { result, rerender } = renderHook(() => useViewTransition());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('falls back to synchronous invocation when startViewTransition is missing', () => {
    // jsdom does not implement startViewTransition; this is the
    // unsupported-browser path that ships to most production users.
    const { result } = renderHook(() => useViewTransition());
    const callback = vi.fn();
    act(() => {
      result.current(callback);
    });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('routes through document.startViewTransition when available', () => {
    const startViewTransition = vi.fn((cb: () => void | Promise<void>) => {
      // Mimic the browser path: call the callback synchronously so the
      // navigation happens inside the transition.
      cb();
      return { finished: Promise.resolve(), ready: Promise.resolve() };
    });
    (
      document as unknown as {
        startViewTransition: typeof startViewTransition;
      }
    ).startViewTransition = startViewTransition;

    const { result } = renderHook(() => useViewTransition());
    const callback = vi.fn();
    act(() => {
      result.current(callback);
    });

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });
});
