/**
 * Cyber coach — secret-redaction filter.
 *
 * Phase 5 of Cyber OS swaps Health's crisis-stream-filter for a SECRET-
 * redaction filter on the assistant's output stream. Cyber is low-harm
 * advisory (no medical / suicide ideation surface) but is high-leakage:
 * the coach reads SIEM logs and configs and could echo a real secret
 * back to the operator in chat. This filter is a safety net, not a
 * substitute for prompt discipline (rule #3 in the system prompt).
 *
 * Pure function — no I/O, no env reads. Buffer-and-flush streaming
 * wrapper lives in `secret-redaction-stream.ts`.
 *
 * Patterns covered:
 *   - AWS access keys              (AKIA + 16 hex/alnum)
 *   - AWS secret keys              (40-char base64, "secret"/"access_key" adjacent)
 *   - RSA private key BEGIN/END blocks
 *   - JWTs                         (eyJ…eyJ…)
 *   - GitHub PATs                  (ghp_/gho_/ghs_/github_pat_)
 *   - Anthropic API keys           (sk-ant-…)
 *   - OpenAI API keys              (sk-…)
 *   - Slack tokens                 (xoxb-/xoxp-/xoxo-/xoxa-/xoxs-)
 */

export interface RedactionMatch {
  type: string;
  count: number;
}

export interface RedactionResult {
  redacted: string;
  matches: RedactionMatch[];
}

interface Pattern {
  type: string;
  /** Global regex; tested against the full text. */
  regex: RegExp;
}

/**
 * AWS secret-key context check. AWS access secrets are 40-char base64ish
 * strings, which match a lot of unrelated content. We require the word
 * "secret" or "access_key" within ~80 chars of the candidate to reduce
 * false positives. Returns true if the match is in a secret-bearing
 * context.
 */
function isAwsSecretContext(full: string, matchIndex: number, matchLen: number): boolean {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(full.length, matchIndex + matchLen + 80);
  const window = full.slice(start, end).toLowerCase();
  return /secret|access[\s_-]?key|aws[\s_-]?secret/.test(window);
}

const PATTERNS: Pattern[] = [
  { type: 'rsa_private_key', regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g },
  { type: 'aws_access_key',  regex: /AKIA[0-9A-Z]{16}/g },
  { type: 'github_token',    regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { type: 'github_token',    regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { type: 'github_token',    regex: /\bghs_[A-Za-z0-9]{36}\b/g },
  { type: 'github_token',    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { type: 'anthropic_key',   regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  { type: 'slack_token',     regex: /\bxox[bpoas]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'jwt',             regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  // OpenAI keys: sk- followed by 40+ alphanumerics. Must run after Anthropic
  // (which is a more specific sk-ant- prefix) so we don't double-tag.
  { type: 'openai_key',      regex: /\bsk-[A-Za-z0-9]{40,}\b/g },
];

/** The 40-char AWS secret pattern is context-gated. Run last so other key
 *  patterns get a shot first. */
const AWS_SECRET_KEY_PATTERN = /\b[A-Za-z0-9/+=]{40}\b/g;

export const MAX_PATTERN_LENGTH = 240;

/**
 * Apply every redaction pattern in sequence. Each match is replaced with
 * `[REDACTED:<type>]` and counted. Returns the redacted text + a list of
 * per-type counts (only types that actually fired).
 */
export function redactSecrets(text: string): RedactionResult {
  if (!text) return { redacted: text, matches: [] };

  const counts = new Map<string, number>();
  let out = text;

  for (const { type, regex } of PATTERNS) {
    out = out.replace(regex, () => {
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return `[REDACTED:${type}]`;
    });
  }

  // AWS secret keys: context-aware to reduce false positives on random
  // base64-like strings.
  out = out.replace(AWS_SECRET_KEY_PATTERN, (match, offset: number, full: string) => {
    if (isAwsSecretContext(full, offset, match.length)) {
      counts.set('aws_secret_key', (counts.get('aws_secret_key') ?? 0) + 1);
      return `[REDACTED:aws_secret_key]`;
    }
    return match;
  });

  return {
    redacted: out,
    matches: Array.from(counts.entries()).map(([type, count]) => ({ type, count })),
  };
}

/** True when redactSecrets would change the input. Used by the stream
 *  wrapper to short-circuit no-op flushes. */
export function containsSecret(text: string): boolean {
  return redactSecrets(text).matches.length > 0;
}
