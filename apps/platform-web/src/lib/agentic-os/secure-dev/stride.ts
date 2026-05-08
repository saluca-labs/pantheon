/**
 * Secure-Dev OS — STRIDE threat model domain logic.
 *
 * Implements a rules-based STRIDE checklist generator. Given a free-text
 * system description, it scans for keywords associated with each STRIDE
 * category and returns a populated checklist of threats to consider.
 *
 * STRIDE is a threat-modeling methodology developed by Microsoft (public domain /
 * open publication). References:
 *   - Shostack, A. (2014). "Threat Modeling: Designing for Security". Wiley.
 *     ISBN 978-1-118-80993-7.
 *   - Microsoft SDL Threat Modeling: https://www.microsoft.com/en-us/securityengineering/sdl/threatmodeling
 *   - OWASP Threat Modeling Process: https://owasp.org/www-community/Threat_Modeling_Process
 *   - OWASP Top 10 2021 (Apache-2.0): https://owasp.org/Top10/
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

export type StrideCategory =
  | 'Spoofing'
  | 'Tampering'
  | 'Repudiation'
  | 'Information Disclosure'
  | 'Denial of Service'
  | 'Elevation of Privilege';

export type ThreatSeverity = 'high' | 'medium' | 'low';

export interface StrideThreat {
  id: string;
  category: StrideCategory;
  title: string;
  description: string;
  mitigations: string[];
  severity: ThreatSeverity;
  /** OWASP or other citation URL (public domain). */
  referenceUrl: string;
  /** Whether this threat was triggered by keywords in the system description. */
  triggered: boolean;
}

export interface StrideChecklist {
  systemDescription: string;
  generatedAt: string;
  threats: StrideThreat[];
}

// ─── STRIDE threat catalogue (rules-based, offline-deterministic) ───────────
// Each entry has trigger keywords, mitigations, and a public reference URL.

const STRIDE_CATALOGUE: Omit<StrideThreat, 'triggered' | 'id'>[] = [
  // ── Spoofing ──
  {
    category: 'Spoofing',
    title: 'Unauthenticated API endpoints',
    description: 'An attacker impersonates a legitimate user or service by calling API endpoints that lack authentication.',
    mitigations: [
      'Enforce authentication on every endpoint (OAuth 2.0, API keys, mTLS).',
      'Use HTTPS everywhere; reject plain HTTP.',
      'Validate JWT signatures and expiry on each request.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
  },
  {
    category: 'Spoofing',
    title: 'Credential phishing / account takeover',
    description: 'Users can be tricked into revealing credentials that allow an attacker to impersonate them.',
    mitigations: [
      'Enforce MFA for all user accounts.',
      'Implement rate limiting and CAPTCHA on login endpoints.',
      'Alert on logins from unusual geolocations or device fingerprints.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
  },

  // ── Tampering ──
  {
    category: 'Tampering',
    title: 'SQL / NoSQL injection',
    description: 'Attacker manipulates queries by injecting malicious input, altering data or logic.',
    mitigations: [
      'Use parameterised queries or prepared statements — never string concatenation.',
      'Apply least-privilege DB roles.',
      'Validate and sanitise all user input server-side.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A03_2021-Injection/',
  },
  {
    category: 'Tampering',
    title: 'Insecure direct object reference (IDOR)',
    description: 'Attacker modifies resource IDs in requests to access or alter records they do not own.',
    mitigations: [
      'Always verify resource ownership in the data layer, not just the route.',
      'Use opaque / random IDs (UUID v4) rather than sequential integers.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
  },

  // ── Repudiation ──
  {
    category: 'Repudiation',
    title: 'Insufficient audit logging',
    description: 'Without tamper-evident logs, a malicious insider or attacker can deny having performed an action.',
    mitigations: [
      'Log all write operations with actor ID, timestamp, and payload digest.',
      'Ship logs to an append-only, centralised store (e.g. AWS CloudWatch, OpenSearch).',
      'Implement log integrity checks (hash chaining or signed log entries).',
    ],
    severity: 'medium',
    referenceUrl: 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/',
  },

  // ── Information Disclosure ──
  {
    category: 'Information Disclosure',
    title: 'Verbose error messages leaking internals',
    description: 'Stack traces, SQL errors, or framework internals returned to clients reveal system architecture.',
    mitigations: [
      'Return generic error responses in production; log details server-side only.',
      'Set appropriate HTTP status codes without internal detail.',
    ],
    severity: 'medium',
    referenceUrl: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
  },
  {
    category: 'Information Disclosure',
    title: 'Sensitive data in transit without TLS',
    description: 'Credentials, PII, or tokens transmitted over plain HTTP are visible to network eavesdroppers.',
    mitigations: [
      'Enforce TLS 1.2+ on all endpoints; redirect HTTP → HTTPS.',
      'Set HSTS headers (Strict-Transport-Security).',
      'Use certificate pinning for high-value mobile clients.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
  },
  {
    category: 'Information Disclosure',
    title: 'Secrets committed to source control',
    description: 'API keys, DB credentials, or private keys embedded in code or config files are exposed.',
    mitigations: [
      'Use a secrets manager (Vault, AWS Secrets Manager, or environment variables).',
      'Run Gitleaks or TruffleHog in CI to block secret commits.',
      'Rotate any secrets that were already committed.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
  },

  // ── Denial of Service ──
  {
    category: 'Denial of Service',
    title: 'Missing rate limiting on public endpoints',
    description: 'Unrestricted requests allow attackers to exhaust compute, memory, or database connections.',
    mitigations: [
      'Apply per-IP and per-user rate limits at the gateway or middleware layer.',
      'Return 429 with Retry-After headers.',
      'Use a WAF or CDN with DDoS protection for public-facing services.',
    ],
    severity: 'medium',
    referenceUrl: 'https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/',
  },
  {
    category: 'Denial of Service',
    title: 'Unbounded file or payload uploads',
    description: 'Large uploads can exhaust disk space or memory, crashing the service.',
    mitigations: [
      'Enforce content-length limits and file-size caps in the web server and application layer.',
      'Store uploads in object storage (S3, GCS) rather than the application server disk.',
    ],
    severity: 'medium',
    referenceUrl: 'https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload',
  },

  // ── Elevation of Privilege ──
  {
    category: 'Elevation of Privilege',
    title: 'Missing authorisation checks (broken access control)',
    description: 'A lower-privileged user accesses admin functionality because role checks are absent or inconsistent.',
    mitigations: [
      'Enforce RBAC or ABAC on every route — never rely on UI hiding alone.',
      'Default to deny; explicitly grant required permissions.',
      'Run automated authorisation tests in CI.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
  },
  {
    category: 'Elevation of Privilege',
    title: 'Dependency with known privilege-escalation CVE',
    description: 'A vulnerable transitive dependency can be exploited to run code with elevated privileges.',
    mitigations: [
      'Run Trivy or Grype in CI to block builds with high/critical CVEs.',
      'Keep dependencies up-to-date with automated PRs (Dependabot, Renovate).',
      'Pin dependency versions and verify checksums.',
    ],
    severity: 'high',
    referenceUrl: 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/',
  },
];

// ─── Keyword triggers per category ────────────────────────────────────────
// Keywords that raise the likelihood of needing a particular STRIDE category.

const CATEGORY_KEYWORDS: Record<StrideCategory, string[]> = {
  Spoofing: ['auth', 'login', 'user', 'identity', 'token', 'jwt', 'oauth', 'session', 'api key', 'credential', 'password'],
  Tampering: ['database', 'db', 'query', 'sql', 'nosql', 'input', 'form', 'upload', 'file', 'write', 'update', 'delete', 'crud', 'rest api', 'graphql'],
  Repudiation: ['log', 'audit', 'admin', 'write', 'delete', 'transaction', 'payment', 'financial'],
  'Information Disclosure': ['secret', 'key', 'password', 'credential', 'pii', 'personal', 'health', 'medical', 'financial', 'token', 'api', 'internal', 'error'],
  'Denial of Service': ['public', 'upload', 'rate', 'api', 'endpoint', 'http', 'web', 'server', 'request', 'file', 'image', 'video'],
  'Elevation of Privilege': ['admin', 'role', 'permission', 'rbac', 'privilege', 'superuser', 'root', 'dependency', 'package', 'npm', 'pip', 'library'],
};

/**
 * Generate a STRIDE checklist from a free-text system description.
 *
 * Rules-based: each threat is "triggered" when its category keywords are found
 * in the description (case-insensitive). Triggered threats appear first.
 * All threats are returned so teams can mark them as N/A if not relevant.
 */
export function generateStrideChecklist(systemDescription: string): StrideChecklist {
  const lower = systemDescription.toLowerCase();

  const threats: StrideThreat[] = STRIDE_CATALOGUE.map((t, i) => {
    const keywords = CATEGORY_KEYWORDS[t.category] ?? [];
    const triggered = keywords.some((kw) => lower.includes(kw));
    return {
      ...t,
      id: `stride-${i + 1}`,
      triggered,
    };
  });

  // Sort: triggered first, then by severity (high > medium > low), then stable.
  const severityOrder: Record<ThreatSeverity, number> = { high: 0, medium: 1, low: 2 };
  threats.sort((a, b) => {
    if (a.triggered !== b.triggered) return a.triggered ? -1 : 1;
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return {
    systemDescription,
    generatedAt: new Date().toISOString(),
    threats,
  };
}

/**
 * Count triggered threats per severity for the summary bar.
 */
export function summariseChecklist(checklist: StrideChecklist): Record<ThreatSeverity, number> {
  const counts: Record<ThreatSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const t of checklist.threats) {
    if (t.triggered) counts[t.severity]++;
  }
  return counts;
}
