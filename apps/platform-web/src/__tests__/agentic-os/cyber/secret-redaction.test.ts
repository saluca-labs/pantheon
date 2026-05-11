/**
 * Cyber coach — secret-redaction pure-function tests.
 *
 * Each pattern type fires; non-secret content passes through unchanged.
 */

import { describe, it, expect } from 'vitest';
import {
  redactSecrets,
  containsSecret,
} from '@/lib/agentic-os/cyber/coach/secret-redaction';

describe('redactSecrets', () => {
  it('passes empty input through', () => {
    expect(redactSecrets('').redacted).toBe('');
    expect(redactSecrets('').matches).toEqual([]);
  });

  it('does not flag prose without secrets', () => {
    const text = 'The alert fired at 09:14 on prod-web-01. Recommend escalation.';
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toBe(text);
    expect(matches).toEqual([]);
  });

  it('redacts AWS access keys', () => {
    const text = 'Found leaked key AKIAIOSFODNN7EXAMPLE in the dump.';
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:aws_access_key]');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(matches.find((m) => m.type === 'aws_access_key')?.count).toBe(1);
  });

  it('redacts RSA private key blocks even across newlines', () => {
    const text = `Header
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAxyz
abc=
-----END RSA PRIVATE KEY-----
Trailer`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:rsa_private_key]');
    expect(redacted).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(matches.find((m) => m.type === 'rsa_private_key')?.count).toBe(1);
  });

  it('redacts BEGIN/END OPENSSH PRIVATE KEY blocks too', () => {
    const text =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n-----END OPENSSH PRIVATE KEY-----';
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toBe('[REDACTED:rsa_private_key]');
    expect(matches[0].type).toBe('rsa_private_key');
  });

  it('redacts JWT tokens', () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEFghi-_xyz';
    const text = `Authorization: Bearer ${token}`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:jwt]');
    expect(redacted).not.toContain(token);
    expect(matches.find((m) => m.type === 'jwt')?.count).toBe(1);
  });

  it('redacts GitHub PATs (ghp_, gho_, ghs_, github_pat_)', () => {
    const text = `
      ghp_${'a'.repeat(36)}
      gho_${'b'.repeat(36)}
      ghs_${'c'.repeat(36)}
      github_pat_${'d'.repeat(82)}
    `;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:github_token]');
    expect(redacted).not.toContain('ghp_aaa');
    expect(matches.find((m) => m.type === 'github_token')?.count).toBe(4);
  });

  it('redacts Anthropic API keys (sk-ant-…)', () => {
    const text = `key=sk-ant-${'A'.repeat(50)}`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:anthropic_key]');
    expect(matches.find((m) => m.type === 'anthropic_key')?.count).toBe(1);
  });

  it('redacts OpenAI keys (sk-…) without double-counting Anthropic ones', () => {
    const text = `openai=sk-${'X'.repeat(48)}\nanthropic=sk-ant-${'Y'.repeat(50)}`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:openai_key]');
    expect(redacted).toContain('[REDACTED:anthropic_key]');
    expect(matches.find((m) => m.type === 'openai_key')?.count).toBe(1);
    expect(matches.find((m) => m.type === 'anthropic_key')?.count).toBe(1);
  });

  it('redacts Slack tokens (xoxb-, xoxp-, …)', () => {
    const text = 'token: xoxb-1234567890-abcdefghij';
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:slack_token]');
    expect(matches.find((m) => m.type === 'slack_token')?.count).toBe(1);
  });

  it('redacts AWS secret keys when "secret" / "access_key" context is near', () => {
    // Canonical AWS docs example secret access key — exactly 40 chars.
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const text = `aws_secret_access_key=${secret} -- rotate now`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toContain('[REDACTED:aws_secret_key]');
    expect(matches.find((m) => m.type === 'aws_secret_key')?.count).toBe(1);
  });

  it('does NOT flag a 40-char base64 string without secret context', () => {
    // base64-looking SHA-like string not adjacent to secret/access_key
    const sha = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890aBcD';
    const text = `Build artifact hash: ${sha}`;
    const { redacted, matches } = redactSecrets(text);
    expect(redacted).toBe(text);
    expect(matches.find((m) => m.type === 'aws_secret_key')).toBeUndefined();
  });

  it('counts multiple matches of the same type', () => {
    const text = `AKIAIOSFODNN7EXAMPLE first, AKIAEXAMPLE12345ABCD second.`;
    const { matches } = redactSecrets(text);
    expect(matches.find((m) => m.type === 'aws_access_key')?.count).toBe(2);
  });

  it('redacts every type in a single pass', () => {
    const text = `
      AKIAIOSFODNN7EXAMPLE
      sk-ant-${'A'.repeat(50)}
      ghp_${'b'.repeat(36)}
      eyJhbG.eyJzdWI.sigxx
      xoxb-1234567890-aaaaaaaa
    `;
    const { matches, redacted } = redactSecrets(text);
    const types = new Set(matches.map((m) => m.type));
    expect(types.has('aws_access_key')).toBe(true);
    expect(types.has('anthropic_key')).toBe(true);
    expect(types.has('github_token')).toBe(true);
    expect(types.has('jwt')).toBe(true);
    expect(types.has('slack_token')).toBe(true);
    expect(redacted).not.toContain('AKIA');
    expect(redacted).not.toContain('sk-ant-');
    expect(redacted).not.toContain('ghp_');
  });
});

describe('containsSecret', () => {
  it('returns true when at least one pattern fires', () => {
    expect(containsSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('returns false when nothing fires', () => {
    expect(containsSecret('Just an alert about a brute-force attempt.')).toBe(false);
  });
});
