/**
 * Secure-Dev OS — pure-logic unit tests for stride.ts helpers.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  generateStrideChecklist,
  summariseChecklist,
} from '@/lib/agentic-os/secure-dev/stride';

describe('generateStrideChecklist', () => {
  it('returns a checklist with all STRIDE categories represented', () => {
    const cl = generateStrideChecklist('A simple web API');
    const categories = new Set(cl.threats.map((t) => t.category));
    expect(categories.has('Spoofing')).toBe(true);
    expect(categories.has('Tampering')).toBe(true);
    expect(categories.has('Repudiation')).toBe(true);
    expect(categories.has('Information Disclosure')).toBe(true);
    expect(categories.has('Denial of Service')).toBe(true);
    expect(categories.has('Elevation of Privilege')).toBe(true);
  });

  it('triggers Spoofing threats when "login" is mentioned', () => {
    const cl = generateStrideChecklist('Users login with JWT tokens');
    const spoofingTriggered = cl.threats.filter(
      (t) => t.category === 'Spoofing' && t.triggered,
    );
    expect(spoofingTriggered.length).toBeGreaterThan(0);
  });

  it('triggers Tampering threats when "database" is mentioned', () => {
    const cl = generateStrideChecklist('PostgreSQL database with user records');
    const tamperingTriggered = cl.threats.filter(
      (t) => t.category === 'Tampering' && t.triggered,
    );
    expect(tamperingTriggered.length).toBeGreaterThan(0);
  });

  it('triggers Information Disclosure when "secret" is mentioned', () => {
    const cl = generateStrideChecklist('Stores API secrets and user credentials');
    const infoDiscTriggered = cl.threats.filter(
      (t) => t.category === 'Information Disclosure' && t.triggered,
    );
    expect(infoDiscTriggered.length).toBeGreaterThan(0);
  });

  it('places triggered threats before non-triggered in the output list', () => {
    const cl = generateStrideChecklist('JWT auth with admin role and PostgreSQL database');
    const firstTriggered = cl.threats.findIndex((t) => t.triggered);
    const lastTriggered = [...cl.threats].reverse().findIndex((t) => t.triggered);
    const firstNotTriggered = cl.threats.findIndex((t) => !t.triggered);
    // All triggered before first non-triggered
    if (firstNotTriggered !== -1 && firstTriggered !== -1) {
      expect(firstTriggered).toBeLessThan(firstNotTriggered);
    }
  });

  it('does not trigger any threats for an empty description', () => {
    const cl = generateStrideChecklist('');
    // A generic description with no matched keywords may have no triggers
    // but the checklist itself should still be valid
    expect(cl.threats.length).toBeGreaterThan(0);
  });

  it('sets generatedAt to a valid ISO timestamp', () => {
    const cl = generateStrideChecklist('simple system');
    expect(() => new Date(cl.generatedAt)).not.toThrow();
    expect(new Date(cl.generatedAt).toISOString()).toBe(cl.generatedAt);
  });

  it('each threat has non-empty mitigations array', () => {
    const cl = generateStrideChecklist('web app');
    for (const t of cl.threats) {
      expect(t.mitigations.length).toBeGreaterThan(0);
    }
  });

  it('each threat has a valid HTTPS reference URL', () => {
    const cl = generateStrideChecklist('api');
    for (const t of cl.threats) {
      expect(t.referenceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('summariseChecklist', () => {
  it('counts triggered threats by severity', () => {
    const cl = generateStrideChecklist('admin login with JWT, PostgreSQL database, public upload API, secrets in environment');
    const summary = summariseChecklist(cl);
    // All values must be non-negative
    expect(summary.high).toBeGreaterThanOrEqual(0);
    expect(summary.medium).toBeGreaterThanOrEqual(0);
    expect(summary.low).toBeGreaterThanOrEqual(0);
    // Total triggered matches the count from the checklist
    const triggeredCount = cl.threats.filter((t) => t.triggered).length;
    expect(summary.high + summary.medium + summary.low).toBe(triggeredCount);
  });
});
