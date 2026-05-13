/**
 * LOG-01 redaction — best-effort scrub of sensitive content from the
 * structured event payload before it hits stdout. Mirrors the Python
 * structlog filter shipped in security/log-01-redaction.
 *
 * Important: we never log raw `system`/`user` strings. We log lengths only.
 */

const PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9_.\-+/=]+/gi },
  { name: 'apikey-anthropic', re: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{32,}/g },
  { name: 'apikey-openai', re: /sk-[A-Za-z0-9]{20,}/g },
];

const PII_KEYS = new Set(['password', 'token', 'apikey', 'api_key', 'secret']);

export function redact<T>(value: T): T {
  return walk(value) as T;
}

function walk(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'string') return scrubString(v);
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  }
  return v;
}

function scrubString(s: string): string {
  let out = s;
  for (const p of PII_PATTERNS) {
    out = out.replace(p.re, `[REDACTED:${p.name}]`);
  }
  return out;
}
