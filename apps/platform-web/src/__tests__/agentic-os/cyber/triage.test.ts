/**
 * CyberSec OS — pure-logic unit tests for triage.ts helpers.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  sortAlerts,
  activeAlerts,
  countByStatus,
  sampleAlerts,
  SEVERITY_ORDER,
} from '@/lib/agentic-os/cyber/triage';
import type { Alert, AlertSeverity, AlertStatus } from '@/lib/agentic-os/cyber/triage';

function fakeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Test Alert',
    description: '',
    severity: 'medium',
    category: 'network',
    status: 'open',
    source: 'test',
    sourceIp: null,
    assignedTo: null,
    notes: null,
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('sortAlerts', () => {
  it('sorts critical before high before medium before low before info', () => {
    const alerts = [
      fakeAlert({ severity: 'info' }),
      fakeAlert({ severity: 'low' }),
      fakeAlert({ severity: 'critical' }),
      fakeAlert({ severity: 'medium' }),
      fakeAlert({ severity: 'high' }),
    ];
    const sorted = sortAlerts(alerts);
    const sevs: AlertSeverity[] = sorted.map((a) => a.severity);
    expect(sevs[0]).toBe('critical');
    expect(sevs[1]).toBe('high');
    expect(sevs[2]).toBe('medium');
    expect(sevs[3]).toBe('low');
    expect(sevs[4]).toBe('info');
  });

  it('does not mutate the original array', () => {
    const alerts = [fakeAlert({ severity: 'low' }), fakeAlert({ severity: 'critical' })];
    const original = [...alerts];
    sortAlerts(alerts);
    expect(alerts[0].severity).toBe(original[0]!.severity);
  });

  it('returns empty array for empty input', () => {
    expect(sortAlerts([])).toHaveLength(0);
  });
});

describe('activeAlerts', () => {
  it('includes only open and investigating alerts', () => {
    const alerts = [
      fakeAlert({ status: 'open' }),
      fakeAlert({ status: 'investigating' }),
      fakeAlert({ status: 'resolved' }),
      fakeAlert({ status: 'false_positive' }),
    ];
    const active = activeAlerts(alerts);
    expect(active).toHaveLength(2);
    expect(active.every((a) => a.status === 'open' || a.status === 'investigating')).toBe(true);
  });
});

describe('countByStatus', () => {
  it('returns zero counts for empty list', () => {
    const counts = countByStatus([]);
    expect(counts.open).toBe(0);
    expect(counts.investigating).toBe(0);
    expect(counts.resolved).toBe(0);
    expect(counts.false_positive).toBe(0);
  });

  it('counts each status correctly', () => {
    const alerts = [
      fakeAlert({ status: 'open' }),
      fakeAlert({ status: 'open' }),
      fakeAlert({ status: 'investigating' }),
      fakeAlert({ status: 'resolved' }),
    ];
    const counts = countByStatus(alerts);
    expect(counts.open).toBe(2);
    expect(counts.investigating).toBe(1);
    expect(counts.resolved).toBe(1);
    expect(counts.false_positive).toBe(0);
  });
});

describe('sampleAlerts', () => {
  it('returns at least 3 sample alerts', () => {
    const samples = sampleAlerts();
    expect(samples.length).toBeGreaterThanOrEqual(3);
  });

  it('each sample has a valid severity', () => {
    const valid: AlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const samples = sampleAlerts();
    for (const s of samples) {
      expect(valid).toContain(s.severity);
    }
  });

  it('each sample has a non-empty title', () => {
    const samples = sampleAlerts();
    for (const s of samples) {
      expect(s.title.trim()).not.toBe('');
    }
  });

  it('includes at least one critical or high severity alert', () => {
    const samples = sampleAlerts();
    const serious = samples.filter((s) => s.severity === 'critical' || s.severity === 'high');
    expect(serious.length).toBeGreaterThan(0);
  });
});

describe('SEVERITY_ORDER', () => {
  it('critical has the lowest order number (highest priority)', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.high);
    expect(SEVERITY_ORDER.high).toBeLessThan(SEVERITY_ORDER.medium);
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.low);
    expect(SEVERITY_ORDER.low).toBeLessThan(SEVERITY_ORDER.info);
  });
});
