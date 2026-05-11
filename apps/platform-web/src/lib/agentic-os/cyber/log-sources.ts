/**
 * CyberSec OS — Log source domain types and constants.
 *
 * Log sources are the upstream systems that emit alerts (SIEM, EDR, IDS,
 * cloud audit logs, firewall, app logs, IdP, webhooks). Phase 1 is
 * informational — no live ingestion; Phase 6 will wire actual collection.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export const LOG_SOURCE_KIND_VALUES = [
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

export type LogSourceKind = (typeof LOG_SOURCE_KIND_VALUES)[number];

export const LOG_SOURCE_STATUS_VALUES = [
  'active',
  'paused',
  'misconfigured',
  'decommissioned',
] as const;

export type LogSourceStatus = (typeof LOG_SOURCE_STATUS_VALUES)[number];

export const LOG_SOURCE_KINDS: { value: LogSourceKind; label: string }[] = [
  { value: 'siem',              label: 'SIEM' },
  { value: 'edr',               label: 'EDR' },
  { value: 'network_ids',       label: 'Network IDS/IPS' },
  { value: 'cloud_audit',       label: 'Cloud audit' },
  { value: 'firewall',          label: 'Firewall' },
  { value: 'app_log',           label: 'Application log' },
  { value: 'identity_provider', label: 'Identity provider' },
  { value: 'webhook',           label: 'Webhook' },
  { value: 'other',             label: 'Other' },
];

export const LOG_SOURCE_STATUSES: { value: LogSourceStatus; label: string; color: string }[] = [
  { value: 'active',         label: 'Active',         color: 'emerald' },
  { value: 'paused',         label: 'Paused',         color: 'amber' },
  { value: 'misconfigured',  label: 'Misconfigured',  color: 'red' },
  { value: 'decommissioned', label: 'Decommissioned', color: 'slate' },
];

export interface LogSource {
  id: string;
  ownerId: string;
  name: string;
  kind: LogSourceKind;
  vendor: string | null;
  endpointHint: string | null;
  status: LogSourceStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LogSourceUpsert {
  name: string;
  kind: LogSourceKind;
  vendor?: string | null;
  endpointHint?: string | null;
  status?: LogSourceStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}
