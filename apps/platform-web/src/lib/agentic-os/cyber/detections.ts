/**
 * CyberSec OS - detections domain types.
 *
 * Mirrors the `agos_cyber_detection_rules` and `agos_cyber_detection_runs` tables from migration 0030_cyber_phase3.
 *
 * @license MIT - Tiresias CyberSec OS (internal).
 */

export type DetectionLifecycle = 'draft' | 'testing' | 'active' | 'deprecated' | 'archived';
export type DetectionSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type DetectionLogSourceKind = 'siem' | 'edr' | 'ids' | 'cloud_audit' | 'firewall' | 'osquery' | 'syslog' | 'webhook' | 'other';

export interface DetectionRule {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  author: string | null;
  lifecycle: DetectionLifecycle;
  severity: DetectionSeverity;
  tactic: string | null;
  technique: string | null;
  logSourceKind: DetectionLogSourceKind | null;
  detection: Record<string, unknown>;
  falsePositives: string[];
  references: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionRuleUpsert {
  name: string;
  description?: string | null;
  author?: string | null;
  lifecycle?: DetectionLifecycle;
  severity?: DetectionSeverity;
  tactic?: string | null;
  technique?: string | null;
  logSourceKind?: DetectionLogSourceKind | null;
  detection?: Record<string, unknown>;
  falsePositives?: string[];
  references?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DetectionRulePatch extends Partial<DetectionRuleUpsert> {}

export interface DetectionRun {
  id: string;
  ruleId: string;
  alertId: string | null;
  triggeredAt: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DetectionRunInsert {
  ruleId: string;
  alertId?: string | null;
  payload?: Record<string, unknown>;
  triggeredAt?: string;
}

export const DETECTION_LIFECYCLE_VALUES = ['draft','testing','active','deprecated','archived'] as const;
export const DETECTION_SEVERITY_VALUES = ['critical','high','medium','low','info'] as const;
export const DETECTION_LOG_SOURCE_KIND_VALUES = ['siem','edr','ids','cloud_audit','firewall','osquery','syslog','webhook','other'] as const;

export const DETECTION_LIFECYCLES: { value: DetectionLifecycle; label: string; description: string }[] = [
  { value: 'draft', label: 'Draft', description: 'Work in progress, not deployed.' },
  { value: 'testing', label: 'Testing', description: 'Validating against historical data.' },
  { value: 'active', label: 'Active', description: 'Live and producing detections.' },
  { value: 'deprecated', label: 'Deprecated', description: 'Superseded; preserved for audit.' },
  { value: 'archived', label: 'Archived', description: 'Hidden from default views.' },
];

export const DETECTION_SEVERITIES: { value: DetectionSeverity; label: string; order: number; color: string }[] = [
  { value: 'critical', label: 'Critical', order: 0, color: 'text-red-500' },
  { value: 'high', label: 'High', order: 1, color: 'text-orange-500' },
  { value: 'medium', label: 'Medium', order: 2, color: 'text-yellow-500' },
  { value: 'low', label: 'Low', order: 3, color: 'text-blue-500' },
  { value: 'info', label: 'Info', order: 4, color: 'text-slate-400' },
];

export const ATTACK_TACTICS: { value: string; label: string }[] = [
  { value: 'reconnaissance', label: 'Reconnaissance' },
  { value: 'resource-development', label: 'Resource Development' },
  { value: 'initial-access', label: 'Initial Access' },
  { value: 'execution', label: 'Execution' },
  { value: 'persistence', label: 'Persistence' },
  { value: 'privilege-escalation', label: 'Privilege Escalation' },
  { value: 'defense-evasion', label: 'Defense Evasion' },
  { value: 'credential-access', label: 'Credential Access' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'lateral-movement', label: 'Lateral Movement' },
  { value: 'collection', label: 'Collection' },
  { value: 'command-and-control', label: 'Command and Control' },
  { value: 'exfiltration', label: 'Exfiltration' },
  { value: 'impact', label: 'Impact' },
];

export const ATTACK_TECHNIQUE_SAMPLES: { id: string; name: string; tactic: string }[] = [
  { id: 'T1110', name: 'Brute Force', tactic: 'credential-access' },
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'execution' },
  { id: 'T1003', name: 'OS Credential Dumping', tactic: 'credential-access' },
  { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'impact' },
  { id: 'T1078', name: 'Valid Accounts', tactic: 'initial-access' },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'initial-access' },
  { id: 'T1098', name: 'Account Manipulation', tactic: 'persistence' },
  { id: 'T1071', name: 'Application Layer Protocol', tactic: 'command-and-control' },
  { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'exfiltration' },
  { id: 'T1562', name: 'Impair Defenses', tactic: 'defense-evasion' },
];

export const STARTER_PACK_RULES: Pick<DetectionRuleUpsert, 'name' | 'description' | 'severity' | 'tactic' | 'technique' | 'logSourceKind' | 'detection' | 'falsePositives' | 'references' | 'tags'>[] = [
  {
    name: 'SSH brute force - multiple failed logins',
    description: 'Detects multiple failed SSH login attempts within a short time window, indicative of brute force attacks.',
    severity: 'high',
    tactic: 'credential-access',
    technique: 'T1110',
    logSourceKind: 'siem',
    detection: {
      condition: 'selection AND count(failed_logins) > 10 within 5m',
      selection: { event_type: 'auth_failure', service: 'sshd' },
      filter: { source_ip: ['127.0.0.1'] }
    },
    falsePositives: [
      'Automated CI runners doing rapid SSH probes',
      'Misconfigured monitoring agents'
    ],
    references: ['https://attack.mitre.org/techniques/T1110/'],
    tags: ['ssh','brute-force','credential-access']
  },
  {
    name: 'Mimikatz process execution',
    description: 'Detects execution of Mimikatz, a tool commonly used for credential dumping.',
    severity: 'critical',
    tactic: 'credential-access',
    technique: 'T1003',
    logSourceKind: 'edr',
    detection: {
      condition: 'selection',
      selection: { process_name: ['mimikatz.exe'], cmdline_contains: ['sekurlsa::','privilege::debug'] }
    },
    falsePositives: [
      'Authorized red team engagement',
      'Internal security training labs'
    ],
    references: ['https://attack.mitre.org/software/S0002/'],
    tags: ['mimikatz','credential-dumping','windows']
  },
  {
    name: 'Suspicious encoded PowerShell command',
    description: 'Detects PowerShell execution with encoded command flags, often used to obfuscate malicious scripts.',
    severity: 'high',
    tactic: 'execution',
    technique: 'T1059',
    logSourceKind: 'edr',
    detection: {
      condition: 'selection',
      selection: { process_name: 'powershell.exe', cmdline_contains: ['-EncodedCommand','-enc'] }
    },
    falsePositives: [
      'Sysadmin automation scripts',
      'Vendor-supplied installers'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/001/'],
    tags: ['powershell','encoded','windows']
  },
  {
    name: 'AWS root account login from new IP',
    description: 'Detects AWS console login using the root user from an IP address not in the allowed list.',
    severity: 'critical',
    tactic: 'initial-access',
    technique: 'T1078',
    logSourceKind: 'cloud_audit',
    detection: {
      condition: 'selection AND NOT filter',
      selection: { event_source: 'signin.amazonaws.com', user_type: 'Root', event_name: 'ConsoleLogin' },
      filter: { source_ip_in_allow_list: true }
    },
    falsePositives: [
      'Genuine root login from new authorized IP (rare, but valid for emergencies)'
    ],
    references: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html'],
    tags: ['aws','root','cloud','initial-access']
  },
  {
    name: 'File integrity - /etc/passwd modified',
    description: 'Detects modifications to the /etc/passwd file, which could indicate persistence mechanisms.',
    severity: 'high',
    tactic: 'persistence',
    technique: 'T1098',
    logSourceKind: 'osquery',
    detection: {
      condition: 'selection',
      selection: { file_path: '/etc/passwd', action: ['modify','create','delete'] }
    },
    falsePositives: [
      'Legitimate user provisioning via configuration management',
      'Patch / upgrade processes that rewrite passwd'
    ],
    references: ['https://attack.mitre.org/techniques/T1098/'],
    tags: ['linux','fim','passwd','persistence']
  },
  {
    name: 'Kubernetes pod exec into prod namespace',
    description: 'Detects exec commands into Kubernetes pods running in production namespaces, which may indicate lateral movement.',
    severity: 'high',
    tactic: 'lateral-movement',
    technique: 'T1609',
    logSourceKind: 'cloud_audit',
    detection: {
      condition: 'selection',
      selection: { verb: 'create', resource: 'pods/exec', namespace: ['prod','production'] }
    },
    falsePositives: [
      'Authorized on-call debugging session',
      'Approved deployment troubleshooting'
    ],
    references: ['https://attack.mitre.org/techniques/T1609/'],
    tags: ['kubernetes','prod','lateral-movement']
  },
  {
    name: 'Outbound connection to known C2 indicator',
    description: 'Detects outbound network connections to IP addresses or domains listed in threat intelligence feeds as known C2 infrastructure.',
    severity: 'critical',
    tactic: 'command-and-control',
    technique: 'T1071',
    logSourceKind: 'firewall',
    detection: {
      condition: 'selection',
      selection: { dest_ip_in_threat_intel: true }
    },
    falsePositives: [
      'Stale or misclassified threat intel feed'
    ],
    references: ['https://attack.mitre.org/tactics/TA0011/'],
    tags: ['c2','threat-intel','network']
  },
  {
    name: 'DNS query to suspicious TLD',
    description: 'Detects DNS queries to top-level domains often associated with malicious activity (e.g., .xyz, .top, .tk, .onion).',
    severity: 'medium',
    tactic: 'command-and-control',
    technique: 'T1071',
    logSourceKind: 'ids',
    detection: {
      condition: 'selection',
      selection: { query_name_tld: ['xyz','top','tk','onion'] }
    },
    falsePositives: [
      'Researchers visiting malware-analysis sites',
      'Legitimate but obscure SaaS vendors using cheap TLDs'
    ],
    references: ['https://attack.mitre.org/techniques/T1071/004/'],
    tags: ['dns','tld','c2']
  },
  {
    name: 'Tor outbound connection',
    description: 'Detects outbound connections to known Tor exit nodes, which may be used to anonymize C2 traffic.',
    severity: 'high',
    tactic: 'command-and-control',
    technique: 'T1090',
    logSourceKind: 'firewall',
    detection: {
      condition: 'selection',
      selection: { dest_ip_in_tor_exit_list: true }
    },
    falsePositives: [
      'Privacy-conscious users in jurisdictions where Tor is permitted',
      'Approved threat-research lab traffic'
    ],
    references: ['https://attack.mitre.org/techniques/T1090/003/'],
    tags: ['tor','c2','network']
  },
  {
    name: 'Anomalous outbound data volume',
    description: 'Detects outbound byte count exceeding ten times the baseline, indicating potential data exfiltration.',
    severity: 'high',
    tactic: 'exfiltration',
    technique: 'T1041',
    logSourceKind: 'firewall',
    detection: {
      condition: 'selection AND outbound_bytes > 10x baseline',
      selection: { direction: 'outbound' }
    },
    falsePositives: [
      'Scheduled backup uploads',
      'CDN sync to cloud storage',
      'Large software releases'
    ],
    references: ['https://attack.mitre.org/techniques/T1041/'],
    tags: ['exfiltration','volume','network']
  },
];

export function isRuleActive(r: Pick<DetectionRule, 'lifecycle'>): boolean {
  return r.lifecycle === 'active';
}

export function lifecycleOrder(l: DetectionLifecycle): number {
  switch (l) {
    case 'draft': return 0;
    case 'testing': return 1;
    case 'active': return 2;
    case 'deprecated': return 3;
    case 'archived': return 4;
  }
}

export function severityOrder(s: DetectionSeverity): number {
  switch (s) {
    case 'critical': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    case 'info': return 4;
  }
}
