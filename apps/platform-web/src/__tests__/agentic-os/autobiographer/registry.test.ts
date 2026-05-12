/**
 * Autobiographer OS — registry update test.
 *
 * Phase 1 replaced the single "Chapter capture" feature card with Books +
 * Memory captures + (retained) legacy Chapter capture. Lock the wiring
 * here so future edits to the registry can't silently regress the surface.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';

describe('Autobiographer OS registry entry', () => {
  it('exists and is marked live', () => {
    const mod = findAgenticOsModule('autobiographer');
    expect(mod).toBeDefined();
    expect(mod!.status).toBe('live');
  });

  it('has the Books feature card pointing at /dashboard/os/autobiographer', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const books = mod.features.find((f) => f.label === 'Books');
    expect(books).toBeDefined();
    expect(books!.href).toBe('/dashboard/os/autobiographer');
  });

  it('has the Memory captures feature card pointing at /memories', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const mem = mod.features.find((f) => f.label === 'Memory captures');
    expect(mem).toBeDefined();
    expect(mem!.href).toBe('/dashboard/os/autobiographer/memories');
  });

  it('retains the legacy Chapter capture card with updated copy', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const chapter = mod.features.find((f) => f.label === 'Chapter capture');
    expect(chapter).toBeDefined();
    expect(chapter!.href).toBe('/dashboard/os/autobiographer/chapters');
    expect(chapter!.description.toLowerCase()).toMatch(
      /legacy|phase 4|single-chapter/,
    );
  });

  // ─── Phase 2 additions ───────────────────────────────────────────────────

  it('has the Phase 2 People feature card pointing at /people', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const people = mod.features.find((f) => f.label === 'People');
    expect(people).toBeDefined();
    expect(people!.href).toBe('/dashboard/os/autobiographer/people');
  });

  // ─── Phase 3 additions ───────────────────────────────────────────────────

  it('has the Phase 3 Voice studio card pointing at /voice', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const voice = mod.features.find((f) => f.label === 'Voice studio');
    expect(voice).toBeDefined();
    expect(voice!.href).toBe('/dashboard/os/autobiographer/voice');
  });

  it('lists exactly the five Phase-3 features', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    expect(mod.features).toHaveLength(5);
  });
});
