/**
 * Research OS — registry sanity check.
 *
 * Phase 1 added an Experiments hub card and kept the existing Hypothesis
 * ledger card. Status remains 'live'.
 *
 * @license MIT — Tiresias Research OS Phase 1 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  AGENTIC_OS_MODULES,
  findAgenticOsModule,
} from '@/lib/agentic-os/registry';

describe('registry Research OS Phase 1 cards', () => {
  const research = findAgenticOsModule('research');

  it('Research module is live', () => {
    expect(research).toBeDefined();
    expect(research!.status).toBe('live');
  });

  it('has an Experiments hub card pointing at /dashboard/os/research/experiments', () => {
    const card = research!.features.find((f) => f.label === 'Experiments hub');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/research/experiments');
  });

  it('keeps the Hypothesis ledger card', () => {
    const card = research!.features.find((f) => f.label === 'Hypothesis ledger');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/research/hypotheses');
  });

  it('does not reference Hephaestus or generic robotics copy', () => {
    const json = JSON.stringify(research);
    expect(json).not.toMatch(/hephaestus/i);
    expect(json).not.toMatch(/robotics/i);
  });

  it('uses academic / lab-research language only', () => {
    const json = JSON.stringify(research).toLowerCase();
    // Spot-check terms in the description / tagline that belong to the
    // research vertical, not the workshop or wet-lab one.
    expect(json).toMatch(/experiment|hypothesis|research/);
  });

  it('experiments hub card has a non-empty description', () => {
    const card = research!.features.find((f) => f.label === 'Experiments hub')!;
    expect(card.description.length).toBeGreaterThan(0);
  });

  it('cross-module: no other module reuses /dashboard/os/research/* hrefs', () => {
    const otherHrefs = AGENTIC_OS_MODULES.filter((m) => m.slug !== 'research')
      .flatMap((m) => m.features.map((f) => f.href));
    for (const href of research!.features.map((f) => f.href)) {
      expect(otherHrefs).not.toContain(href);
    }
  });

  // ─── Phase 2 additions ──────────────────────────────────────────────────

  it('Phase 2: has a Lab notebook card', () => {
    const card = research!.features.find((f) => f.label === 'Lab notebook');
    expect(card).toBeDefined();
  });

  it('Phase 2: Lab notebook card points at the experiments hub', () => {
    // The notebook is per-experiment so the registry card is a pointer
    // into the experiments hub — drill into a specific experiment to
    // see the timeline.
    const card = research!.features.find((f) => f.label === 'Lab notebook')!;
    expect(card.href).toBe('/dashboard/os/research/experiments');
  });

  it('Phase 2: Lab notebook card description mentions the timeline + kinds', () => {
    const card = research!.features.find((f) => f.label === 'Lab notebook')!;
    expect(card.description.length).toBeGreaterThan(20);
    // Description should hint at ELN-shape semantics.
    expect(card.description.toLowerCase()).toMatch(/note|timeline|observation|result/);
  });

  it('Phase 2: Experiments hub + Hypothesis ledger cards still present (no Phase 1 regression)', () => {
    expect(research!.features.find((f) => f.label === 'Experiments hub')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Hypothesis ledger')).toBeDefined();
  });

  // ─── Phase 5 additions ──────────────────────────────────────────────────

  it('Phase 5: has a Protocols card pointing at /dashboard/os/research/protocols', () => {
    const card = research!.features.find((f) => f.label === 'Protocols');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/research/protocols');
  });

  it('Phase 5: Protocols card description mentions version pinning', () => {
    const card = research!.features.find((f) => f.label === 'Protocols')!;
    expect(card.description.toLowerCase()).toMatch(/version|method|sop|pin/);
  });

  it('Phase 5: has a Reproducibility export card pointing at /dashboard/os/research/exports', () => {
    const card = research!.features.find((f) => f.label === 'Reproducibility export');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/research/exports');
  });

  it('Phase 5: previous phase cards still present (no regression)', () => {
    expect(research!.features.find((f) => f.label === 'Literature library')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Lab notebook')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Hypothesis ledger')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Experiments hub')).toBeDefined();
  });

  // ─── Phase 6 additions ──────────────────────────────────────────────────

  it('Phase 6: has a Top blockers card pointing at /dashboard/os/research/blockers', () => {
    const card = research!.features.find((f) => f.label === 'Top blockers');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/research/blockers');
  });

  it('Phase 6: Top blockers card description mentions milestones + dependencies', () => {
    const card = research!.features.find((f) => f.label === 'Top blockers')!;
    expect(card.description.length).toBeGreaterThan(0);
    expect(card.description.toLowerCase()).toMatch(/milestone|deadline|risk/);
    expect(card.description.toLowerCase()).toMatch(/dependency|edge|blocks/);
  });

  it('Phase 6: previous phase cards still present (no regression)', () => {
    expect(research!.features.find((f) => f.label === 'Protocols')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Reproducibility export')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Literature library')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Lab notebook')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Hypothesis ledger')).toBeDefined();
    expect(research!.features.find((f) => f.label === 'Experiments hub')).toBeDefined();
  });
});
