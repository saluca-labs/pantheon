/**
 * CyberSec OS — alert triage domain logic.
 *
 * Provides types and pure-logic helpers for the alert triage queue.
 * Alert severity taxonomy follows CVSS base score categories (public domain).
 * Alert categories are derived from common SIEM/IDS alert types used by
 * Wazuh (GPL) and Suricata (GPL) — the category names themselves are
 * standard industry terminology (public domain).
 *
 * References:
 *   - CVSS v3.1 scoring guide (public domain):
 *     https://www.first.org/cvss/v3.1/specification-document
 *   - Wazuh alert taxonomy (GPL):
 *     https://documentation.wazuh.com/current/user-manual/ruleset/
 *   - MITRE ATT&CK (CC BY 4.0):
 *     https://attack.mitre.org/
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'false_positive';
export type AlertCategory =
  | 'authentication'
  | 'network'
  | 'malware'
  | 'data_exfiltration'
  | 'privilege_escalation'
  | 'vulnerability'
  | 'policy_violation'
  | 'other';

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  status: AlertStatus;
  source: string;
  sourceIp: string | null;
  assignedTo: string | null;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  // Phase 1 enrichment fields (nullable until linked).
  assetId: string | null;
  logSourceId: string | null;
  tactic: string | null;
  technique: string | null;
  correlationId: string | null;
  tags: string[];
  raw: Record<string, unknown>;
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const ALERT_SEVERITIES: { value: AlertSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

export const ALERT_STATUSES: { value: AlertStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False Positive' },
];

export const ALERT_CATEGORIES: { value: AlertCategory; label: string }[] = [
  { value: 'authentication', label: 'Authentication' },
  { value: 'network', label: 'Network' },
  { value: 'malware', label: 'Malware' },
  { value: 'data_exfiltration', label: 'Data Exfiltration' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'vulnerability', label: 'Vulnerability' },
  { value: 'policy_violation', label: 'Policy Violation' },
  { value: 'other', label: 'Other' },
];

/**
 * Sort alerts by severity (critical first), then by occurredAt descending.
 * Pure function — does not mutate the input array.
 */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });
}

/**
 * Filter open/investigating alerts only (active queue).
 */
export function activeAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.status === 'open' || a.status === 'investigating');
}

/**
 * Count alerts by status.
 */
export function countByStatus(alerts: Alert[]): Record<AlertStatus, number> {
  const counts: Record<AlertStatus, number> = {
    open: 0,
    investigating: 0,
    resolved: 0,
    false_positive: 0,
  };
  for (const a of alerts) {
    counts[a.status]++;
  }
  return counts;
}

/**
 * Seed sample alerts for a new user (deterministic, no external data).
 * These represent realistic-looking but entirely synthetic alert data.
 *
 * References used for sample content:
 *   - Common Wazuh alert IDs: https://documentation.wazuh.com/current/user-manual/ruleset/
 *   - MITRE ATT&CK techniques (CC BY 4.0): https://attack.mitre.org/techniques/enterprise/
 */
/**
 * Seed sample alert shape — what `createAlert` actually consumes. Mirrors
 * `AlertInsert` in repo.ts; enrichment fields are added later via
 * `/alerts/[id]/enrich` so they are not part of this seed.
 */
export interface SampleAlert {
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  status: AlertStatus;
  source: string;
  sourceIp: string | null;
  assignedTo: string | null;
  notes: string | null;
  occurredAt: string;
}

export function sampleAlerts(): SampleAlert[] {
  const now = new Date();
  function hoursAgo(h: number): string {
    return new Date(now.getTime() - h * 3600 * 1000).toISOString();
  }

  return [
    {
      title: 'Multiple failed SSH login attempts (brute force)',
      description: 'Wazuh rule 5712: 10+ failed SSH authentication attempts from 198.51.100.42 in 60 seconds. Possible brute-force attack. Ref: ATT&CK T1110.',
      severity: 'high',
      category: 'authentication',
      status: 'open',
      source: 'Wazuh HIDS',
      sourceIp: '198.51.100.42',
      assignedTo: null,
      notes: null,
      occurredAt: hoursAgo(1),
    },
    {
      title: 'Outbound connection to known C2 IP',
      description: 'Suricata ET TROJAN rule: host 10.0.1.55 established TCP connection to 203.0.113.99:4444 — listed in abuse.ch ThreatFox as Cobalt Strike C2. Ref: ATT&CK T1071.',
      severity: 'critical',
      category: 'malware',
      status: 'open',
      source: 'Suricata IDS',
      sourceIp: '10.0.1.55',
      assignedTo: null,
      notes: null,
      occurredAt: hoursAgo(2),
    },
    {
      title: 'Privilege escalation: sudo to root',
      description: 'Wazuh rule 5402: user "devops" ran "sudo -i" and obtained root shell on prod-web-01. Ref: ATT&CK T1548.003.',
      severity: 'high',
      category: 'privilege_escalation',
      status: 'investigating',
      source: 'Wazuh HIDS',
      sourceIp: null,
      assignedTo: 'analyst@example.com',
      notes: 'Confirmed with devops team — scheduled maintenance. Marking after verification.',
      occurredAt: hoursAgo(3),
    },
    {
      title: 'High data transfer to external host (>500 MB)',
      description: 'Netflow anomaly: 10.0.2.10 transferred 620 MB to 192.0.2.77 over HTTPS in 5 minutes. Baseline is < 50 MB/day. Ref: ATT&CK T1048.',
      severity: 'medium',
      category: 'data_exfiltration',
      status: 'open',
      source: 'NetFlow / SIEM',
      sourceIp: '10.0.2.10',
      assignedTo: null,
      notes: null,
      occurredAt: hoursAgo(4),
    },
    {
      title: 'Vulnerability: CVE-2023-44487 (HTTP/2 Rapid Reset) detected',
      description: 'Trivy scan found nginx:1.24.0 in container prod-api — affected by CVE-2023-44487 (CVSS 7.5 HIGH). Patch to nginx ≥ 1.25.3.',
      severity: 'high',
      category: 'vulnerability',
      status: 'open',
      source: 'Trivy Container Scan',
      sourceIp: null,
      assignedTo: null,
      notes: null,
      occurredAt: hoursAgo(6),
    },
    {
      title: 'Login from unusual geolocation',
      description: 'User admin@example.com logged in from IP 41.211.x.x (Nigeria) — previous 30 logins all from US. Ref: ATT&CK T1078.',
      severity: 'medium',
      category: 'authentication',
      status: 'resolved',
      source: 'Auth logs / SIEM',
      sourceIp: '41.211.0.1',
      assignedTo: 'analyst@example.com',
      notes: 'Confirmed with user — travelling. Closed as false positive after MFA re-verification.',
      occurredAt: hoursAgo(12),
    },
  ];
}
