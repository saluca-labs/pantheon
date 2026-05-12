/**
 * Business OS — registry tests.
 *
 * Phase 1 replaces the single Contacts CRM card with four primary cards
 * (People / Organizations / Recent activity / Settings) plus a
 * deprecated alias for the old /contacts path.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  AGENTIC_OS_MODULES,
  findAgenticOsModule,
} from '@/lib/agentic-os/registry';

describe('registry Business OS Phase 1 cards', () => {
  const business = findAgenticOsModule('business');

  it('Business module is live', () => {
    expect(business).toBeDefined();
    expect(business!.status).toBe('live');
  });

  it('uses the teal accent', () => {
    expect(business!.accent).toBe('teal');
  });

  it('points at business.md plan doc', () => {
    expect(business!.planFile).toBe('business.md');
  });

  it('has a People card pointing at /dashboard/os/business/people', () => {
    const card = business!.features.find((f) => f.label === 'People');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/business/people');
  });

  it('has an Organizations card pointing at /dashboard/os/business/organizations', () => {
    const card = business!.features.find((f) => f.label === 'Organizations');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/business/organizations');
  });

  it('has a Recent activity card pointing at the hub', () => {
    const card = business!.features.find((f) => f.label === 'Recent activity');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/business');
  });

  it('has a Settings card pointing at /dashboard/os/business/settings', () => {
    const card = business!.features.find((f) => f.label === 'Settings');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/business/settings');
  });

  it('does not reference Twenty / Invoice-Ninja / Solidtime co-process stack', () => {
    const json = JSON.stringify(business);
    expect(json).not.toMatch(/twenty/i);
    expect(json).not.toMatch(/invoice ninja/i);
    expect(json).not.toMatch(/solidtime/i);
    expect(json).not.toMatch(/docuseal/i);
  });

  it('descriptions are non-empty and under 200 chars each', () => {
    for (const card of business!.features) {
      expect(card.description.length).toBeGreaterThan(0);
      expect(card.description.length).toBeLessThan(200);
    }
  });

  it('no href collisions with any other module', () => {
    const otherHrefs = AGENTIC_OS_MODULES.filter((m) => m.slug !== 'business')
      .flatMap((m) => m.features.map((f) => f.href));
    // We allow `/dashboard/os/business` to be repeated WITHIN business
    // (it's the hub + recent-activity card both pointing at it). The
    // cross-module check is what matters.
    for (const href of business!.features.map((f) => f.href)) {
      expect(otherHrefs).not.toContain(href);
    }
  });

  it('has a Deals card pointing at /dashboard/os/business/deals', () => {
    const card = business!.features.find((f) => f.label === 'Deals');
    expect(card).toBeDefined();
    expect(card!.href).toBe('/dashboard/os/business/deals');
  });

  it('exposes 5 feature cards in Phase 2', () => {
    expect(business!.features).toHaveLength(5);
  });

  it('tagline matches the Business OS positioning', () => {
    expect(business!.tagline.toLowerCase()).toMatch(/solo|enterprise|business/);
  });

  it('icon is set (Lucide Briefcase)', () => {
    expect(business!.icon).toBeDefined();
  });

  it('shortName + label are non-empty', () => {
    expect(business!.shortName.length).toBeGreaterThan(0);
    expect(business!.label.length).toBeGreaterThan(0);
  });
});
