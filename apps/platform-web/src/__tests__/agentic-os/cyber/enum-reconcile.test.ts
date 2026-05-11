/**
 * CyberSec OS — Phase 3 log_source_kind enum reconcile sanity check.
 *
 * Static assertion test that the canonical enum in `log-sources.ts` matches
 * what the lib + migration both expect, and that no stale values from the
 * original Phase 3 migration leak into the lib types.
 *
 * The actual UPDATE-mapping in migration 0031 is exercised at apply-time;
 * here we only enforce that the symbol surface is canonical.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { LOG_SOURCE_KIND_VALUES } from '@/lib/agentic-os/cyber/log-sources';
import { DETECTION_LOG_SOURCE_KIND_VALUES } from '@/lib/agentic-os/cyber/detections';

const CANONICAL = [
  'siem',
  'edr',
  'network_ids',
  'cloud_audit',
  'firewall',
  'app_log',
  'identity_provider',
  'webhook',
  'other',
] as const;

describe('log_source_kind canonical enum', () => {
  it('log-sources.ts matches the canonical set', () => {
    expect([...LOG_SOURCE_KIND_VALUES].sort()).toEqual([...CANONICAL].sort());
  });

  it('detections.ts shares the same canonical set after Phase 4 reconcile', () => {
    expect([...DETECTION_LOG_SOURCE_KIND_VALUES].sort()).toEqual([...CANONICAL].sort());
  });

  it('no stale Phase 3 values (ids/osquery/syslog) leak into the lib types', () => {
    const stale = ['ids', 'osquery', 'syslog'];
    for (const v of stale) {
      expect(LOG_SOURCE_KIND_VALUES as readonly string[]).not.toContain(v);
      expect(DETECTION_LOG_SOURCE_KIND_VALUES as readonly string[]).not.toContain(v);
    }
  });
});
