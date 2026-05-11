/**
 * CyberSec OS — IOC (indicator of compromise) domain types and constants.
 *
 * Mirrors `agos_cyber_iocs` from migration 0031_cyber_phase4. Twelve kinds
 * cover the practical 90% of IOC ingestion; eight threat types match what
 * abuse.ch / Mandiant / VirusTotal feeds typically emit.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export const IOC_KIND_VALUES = [
  'ipv4',
  'ipv6',
  'domain',
  'url',
  'file_hash_md5',
  'file_hash_sha1',
  'file_hash_sha256',
  'email',
  'registry_key',
  'mutex',
  'user_agent',
  'other',
] as const;

export type IocKind = (typeof IOC_KIND_VALUES)[number];

export const THREAT_TYPE_VALUES = [
  'malware',
  'phishing',
  'c2',
  'exfil',
  'exploit',
  'scanning',
  'brute_force',
  'unknown',
] as const;

export type ThreatType = (typeof THREAT_TYPE_VALUES)[number];

export interface IocKindMeta {
  value: IocKind;
  label: string;
  /** Lucide icon name — UI imports the icon component by string lookup. */
  icon: string;
}

export const IOC_KINDS: IocKindMeta[] = [
  { value: 'ipv4',             label: 'IPv4 address',         icon: 'Globe'      },
  { value: 'ipv6',             label: 'IPv6 address',         icon: 'Globe'      },
  { value: 'domain',           label: 'Domain',               icon: 'Globe2'     },
  { value: 'url',              label: 'URL',                  icon: 'Link'       },
  { value: 'file_hash_md5',    label: 'File hash (MD5)',      icon: 'FileDigit'  },
  { value: 'file_hash_sha1',   label: 'File hash (SHA1)',     icon: 'FileDigit'  },
  { value: 'file_hash_sha256', label: 'File hash (SHA256)',   icon: 'FileDigit'  },
  { value: 'email',            label: 'Email address',        icon: 'Mail'       },
  { value: 'registry_key',     label: 'Registry key',         icon: 'KeyRound'   },
  { value: 'mutex',            label: 'Mutex',                icon: 'Lock'       },
  { value: 'user_agent',       label: 'User-Agent',           icon: 'Smartphone' },
  { value: 'other',            label: 'Other',                icon: 'Box'        },
];

export interface ThreatTypeMeta {
  value: ThreatType;
  label: string;
  color: string;
}

export const THREAT_TYPES: ThreatTypeMeta[] = [
  { value: 'malware',     label: 'Malware',         color: 'red'     },
  { value: 'phishing',    label: 'Phishing',        color: 'orange'  },
  { value: 'c2',          label: 'C2 / beacon',     color: 'red'     },
  { value: 'exfil',       label: 'Exfiltration',    color: 'amber'   },
  { value: 'exploit',     label: 'Exploit',         color: 'orange'  },
  { value: 'scanning',    label: 'Scanning',        color: 'blue'    },
  { value: 'brute_force', label: 'Brute force',     color: 'amber'   },
  { value: 'unknown',     label: 'Unknown',         color: 'slate'   },
];

export interface Ioc {
  id: string;
  ownerId: string;
  kind: IocKind;
  value: string;
  title: string | null;
  description: string | null;
  threatType: ThreatType | null;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  source: string | null;
  tags: string[];
  references: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IocUpsert {
  kind: IocKind;
  value: string;
  title?: string | null;
  description?: string | null;
  threatType?: ThreatType | null;
  confidence?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  expiresAt?: string | null;
  source?: string | null;
  tags?: string[];
  references?: string[];
  metadata?: Record<string, unknown>;
}

export type IocPatch = Partial<Omit<IocUpsert, 'kind' | 'value'>>;

/** True when expires_at is set and in the past. */
export function isIocExpired(
  ioc: Pick<Ioc, 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (!ioc.expiresAt) return false;
  return new Date(ioc.expiresAt).getTime() <= now.getTime();
}

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}$|^(?:[A-Fa-f0-9]{1,4}:){1,7}:$|^::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}$|^[A-Fa-f0-9:]+::[A-Fa-f0-9:]*$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MD5_RE = /^[A-Fa-f0-9]{32}$/;
const SHA1_RE = /^[A-Fa-f0-9]{40}$/;
const SHA256_RE = /^[A-Fa-f0-9]{64}$/;

export interface IocValidation {
  ok: boolean;
  error?: string;
}

/**
 * Per-kind value validation. Cheap regex checks suitable for catching
 * fat-finger / paste errors at the API edge; not exhaustive parsing.
 */
export function validateIocValue(kind: IocKind, value: string): IocValidation {
  const v = (value ?? '').trim();
  if (v.length === 0) return { ok: false, error: 'value is required' };
  switch (kind) {
    case 'ipv4':
      return IPV4_RE.test(v) ? { ok: true } : { ok: false, error: 'not a valid IPv4 address' };
    case 'ipv6':
      return IPV6_RE.test(v) ? { ok: true } : { ok: false, error: 'not a valid IPv6 address' };
    case 'domain':
      return DOMAIN_RE.test(v) ? { ok: true } : { ok: false, error: 'not a valid domain name' };
    case 'url':
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:'
          ? { ok: true }
          : { ok: false, error: 'unsupported URL scheme' };
      } catch {
        return { ok: false, error: 'not a valid URL' };
      }
    case 'file_hash_md5':
      return MD5_RE.test(v) ? { ok: true } : { ok: false, error: 'MD5 must be 32 hex chars' };
    case 'file_hash_sha1':
      return SHA1_RE.test(v) ? { ok: true } : { ok: false, error: 'SHA1 must be 40 hex chars' };
    case 'file_hash_sha256':
      return SHA256_RE.test(v) ? { ok: true } : { ok: false, error: 'SHA256 must be 64 hex chars' };
    case 'email':
      return EMAIL_RE.test(v) ? { ok: true } : { ok: false, error: 'not a valid email address' };
    case 'registry_key':
    case 'mutex':
    case 'user_agent':
    case 'other':
      // Free-form — only require non-empty.
      return v.length <= 2048
        ? { ok: true }
        : { ok: false, error: 'value too long (>2048 chars)' };
  }
}
