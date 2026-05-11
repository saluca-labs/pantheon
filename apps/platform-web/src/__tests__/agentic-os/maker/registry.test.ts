/**
 * Maker OS — registry sanity check.
 *
 * Phase 2 added Parts catalog + Suppliers cards and removed the legacy
 * "Parts inventory" card (since parts moved to a workshop-global catalog).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  AGENTIC_OS_MODULES,
  findAgenticOsModule,
} from '@/lib/agentic-os/registry';

describe('registry Maker OS Phase 2 cards', () => {
  const maker = findAgenticOsModule('maker');

  it('Maker module is live', () => {
    expect(maker).toBeDefined();
    expect(maker!.status).toBe('live');
  });

  it('has a Parts catalog card pointing at /dashboard/os/maker/catalog', () => {
    const card = maker!.features.find((f) => f.label === 'Parts catalog');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/maker/catalog');
  });

  it('has a Suppliers card pointing at /dashboard/os/maker/suppliers', () => {
    const card = maker!.features.find((f) => f.label === 'Suppliers');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/maker/suppliers');
  });

  it('removed the legacy "Parts inventory" card from Phase 1', () => {
    const card = maker!.features.find((f) => f.label === 'Parts inventory');
    expect(card).toBeUndefined();
  });

  it('keeps the Projects hub card', () => {
    const card = maker!.features.find((f) => f.label === 'Projects hub');
    expect(card).toBeDefined();
  });

  it('does not reference Hephaestus anywhere in the module copy', () => {
    const json = JSON.stringify(AGENTIC_OS_MODULES);
    expect(json).not.toMatch(/hephaestus/i);
  });

  it('has an AI coach card pointing at /dashboard/os/maker/coach (Phase 7)', () => {
    const card = maker!.features.find((f) => f.label === 'AI coach');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/maker/coach');
  });
});
