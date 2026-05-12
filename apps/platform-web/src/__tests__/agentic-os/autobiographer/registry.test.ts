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

  // Phase 4 renames Chapter capture -> Chapters and repurposes the
  // surface to the workshop-wide chapter index. Same href.
  it('has the Phase 4 Chapters card pointing at /chapters', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const chapter = mod.features.find((f) => f.label === 'Chapters');
    expect(chapter).toBeDefined();
    expect(chapter!.href).toBe('/dashboard/os/autobiographer/chapters');
    expect(chapter!.description.toLowerCase()).toMatch(
      /chapter|revision|provenance|book/,
    );
  });

  it('no longer exposes the legacy "Chapter capture" label (renamed to Chapters)', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const legacy = mod.features.find((f) => f.label === 'Chapter capture');
    expect(legacy).toBeUndefined();
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

  // ─── Phase 5 additions ───────────────────────────────────────────────────

  it('has the Phase 5 Timeline feature card pointing at /timeline', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const timeline = mod.features.find((f) => f.label === 'Timeline');
    expect(timeline).toBeDefined();
    expect(timeline!.href).toBe('/dashboard/os/autobiographer/timeline');
    expect(timeline!.description.toLowerCase()).toMatch(
      /timeline|year|decade|theme|memory/,
    );
  });

  // ─── Phase 6 additions ───────────────────────────────────────────────────

  it('has the Phase 6 Privacy review feature card pointing at /privacy', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    const priv = mod.features.find((f) => f.label === 'Privacy review');
    expect(priv).toBeDefined();
    expect(priv!.href).toBe('/dashboard/os/autobiographer/privacy');
    expect(priv!.description.toLowerCase()).toMatch(
      /pseudonym|consent|review|privacy/,
    );
  });

  it('lists exactly the seven feature surfaces after Phase 6 (… + Privacy review)', () => {
    const mod = findAgenticOsModule('autobiographer')!;
    expect(mod.features).toHaveLength(7);
    const labels = mod.features.map((f) => f.label).sort();
    expect(labels).toEqual(
      [
        'Books',
        'Chapters',
        'Memory captures',
        'People',
        'Privacy review',
        'Timeline',
        'Voice studio',
      ],
    );
  });
});
