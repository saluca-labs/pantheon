/**
 * CyberSec OS — Vulnerability domain types and constants.
 *
 * Mirrors `agos_cyber_vulnerabilities` from migration 0031_cyber_phase4.
 * A vulnerability is the underlying flaw (CVE or otherwise); each
 * (vulnerability × asset) pairing is an Exposure (see `exposures.ts`).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export const VULNERABILITY_SEVERITY_VALUES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

export type VulnerabilitySeverity = (typeof VULNERABILITY_SEVERITY_VALUES)[number];

/** Alias — Severity is the canonical name used by importers + PDFs. */
export type Severity = VulnerabilitySeverity;

export interface VulnerabilitySeverityMeta {
  value: VulnerabilitySeverity;
  label: string;
  /** Lower = more severe (sort order). */
  order: number;
  /** Tailwind colour hint used by badges. */
  color: string;
}

export const VULNERABILITY_SEVERITIES: VulnerabilitySeverityMeta[] = [
  { value: 'critical', label: 'Critical', order: 0, color: 'red' },
  { value: 'high',     label: 'High',     order: 1, color: 'orange' },
  { value: 'medium',   label: 'Medium',   order: 2, color: 'amber' },
  { value: 'low',      label: 'Low',      order: 3, color: 'blue' },
  { value: 'info',     label: 'Info',     order: 4, color: 'slate' },
];

export interface Vulnerability {
  id: string;
  ownerId: string;
  cveId: string | null;
  title: string;
  description: string | null;
  severity: VulnerabilitySeverity;
  cvssScore: number | null;
  cvssVector: string | null;
  cweId: string | null;
  vendor: string | null;
  product: string | null;
  affectedVersions: string[];
  fixedVersions: string[];
  publishedAt: string | null;
  references: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VulnerabilityUpsert {
  cveId?: string | null;
  title: string;
  description?: string | null;
  severity?: VulnerabilitySeverity;
  cvssScore?: number | null;
  cvssVector?: string | null;
  cweId?: string | null;
  vendor?: string | null;
  product?: string | null;
  affectedVersions?: string[];
  fixedVersions?: string[];
  publishedAt?: string | null;
  references?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type VulnerabilityPatch = Partial<VulnerabilityUpsert>;

/**
 * Map a CVSS v3.x base score to the qualitative severity bucket.
 * Source: FIRST CVSS v3.1 specification §5 (qualitative rating scale).
 *
 *   0.0           → info
 *   0.1 – 3.9     → low
 *   4.0 – 6.9     → medium
 *   7.0 – 8.9     → high
 *   9.0 – 10.0    → critical
 */
export function cvssToSeverity(score: number): Severity {
  if (!Number.isFinite(score) || score < 0) return 'info';
  if (score === 0) return 'info';
  if (score < 4.0) return 'low';
  if (score < 7.0) return 'medium';
  if (score < 9.0) return 'high';
  return 'critical';
}
