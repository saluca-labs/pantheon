/**
 * CyberSec OS — Asset domain types and constants.
 *
 * Assets are the things being protected: hosts, containers, SaaS accounts,
 * repos, cloud resources, user identities, network/IoT devices, databases.
 * Alerts are enriched by linking to an asset (and a log source).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export const ASSET_KIND_VALUES = [
  'host',
  'container',
  'saas_account',
  'repository',
  'cloud_resource',
  'user',
  'network_device',
  'iot_device',
  'database',
  'other',
] as const;

export type AssetKind = (typeof ASSET_KIND_VALUES)[number];

export const ASSET_CRITICALITY_VALUES = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type AssetCriticality = (typeof ASSET_CRITICALITY_VALUES)[number];

export interface AssetKindMeta {
  value: AssetKind;
  label: string;
  /** Lucide icon name — UI imports the icon component by string lookup. */
  icon: string;
}

export const ASSET_KINDS: AssetKindMeta[] = [
  { value: 'host',           label: 'Host',            icon: 'Server' },
  { value: 'container',      label: 'Container',       icon: 'Container' },
  { value: 'saas_account',   label: 'SaaS account',    icon: 'Cloud' },
  { value: 'repository',     label: 'Repository',      icon: 'GitBranch' },
  { value: 'cloud_resource', label: 'Cloud resource',  icon: 'CloudCog' },
  { value: 'user',           label: 'User',            icon: 'User' },
  { value: 'network_device', label: 'Network device',  icon: 'Router' },
  { value: 'iot_device',     label: 'IoT device',      icon: 'Cpu' },
  { value: 'database',       label: 'Database',        icon: 'Database' },
  { value: 'other',          label: 'Other',           icon: 'Box' },
];

export interface AssetCriticalityMeta {
  value: AssetCriticality;
  label: string;
  /** Lower = more critical (used for desc sort by criticality). */
  order: number;
  /** Tailwind colour hint used by badge components. */
  color: string;
}

export const ASSET_CRITICALITIES: AssetCriticalityMeta[] = [
  { value: 'critical', label: 'Critical', order: 0, color: 'red' },
  { value: 'high',     label: 'High',     order: 1, color: 'orange' },
  { value: 'medium',   label: 'Medium',   order: 2, color: 'amber' },
  { value: 'low',      label: 'Low',      order: 3, color: 'slate' },
];

export const ASSET_CRITICALITY_ORDER: Record<AssetCriticality, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface Asset {
  id: string;
  ownerId: string;
  name: string;
  kind: AssetKind;
  criticality: AssetCriticality;
  environment: string | null;
  hostname: string | null;
  ipAddress: string | null;
  osFamily: string | null;
  osVersion: string | null;
  ownerEmail: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  decommissionedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetUpsert {
  name: string;
  kind: AssetKind;
  criticality: AssetCriticality;
  environment?: string | null;
  hostname?: string | null;
  ipAddress?: string | null;
  osFamily?: string | null;
  osVersion?: string | null;
  ownerEmail?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
