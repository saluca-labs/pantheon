/**
 * Cyber coach — streaming-wrapper tests.
 *
 * Covers:
 *  - Patterns straddling chunk boundaries still get caught
 *  - Final tail is flushed on stream end
 *  - onMatch callback fires with aggregate counts
 *  - Pure passthrough when no secrets appear
 */

import { describe, it, expect, vi } from 'vitest';
import { wrapStreamWithRedaction } from '@/lib/agentic-os/cyber/coach/secret-redaction-stream';
import type { RedactionMatch } from '@/lib/agentic-os/cyber/coach/secret-redaction';

async function* fromChunks(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) {
    yield c;
  }
}

async function drain(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

describe('wrapStreamWithRedaction', () => {
  it('passes plain text through unchanged', async () => {
    const out = await drain(
      wrapStreamWithRedaction(
        fromChunks(['Hello, ', 'this is ', 'a normal ', 'alert summary.']),
      ),
    );
    expect(out).toBe('Hello, this is a normal alert summary.');
  });

  it('redacts an AKIA access key delivered in one chunk', async () => {
    const out = await drain(
      wrapStreamWithRedaction(
        fromChunks(['leak: AKIAIOSFODNN7EXAMPLE found.']),
      ),
    );
    expect(out).toContain('[REDACTED:aws_access_key]');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts an AKIA access key split across two chunks', async () => {
    // Boundary split: "AKIA" + "IOSFODNN7EXAMPLE"
    const out = await drain(
      wrapStreamWithRedaction(fromChunks(['leak: AKIA', 'IOSFODNN7EXAMPLE found.'])),
    );
    expect(out).toContain('[REDACTED:aws_access_key]');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts an Anthropic key split mid-token across many tiny chunks', async () => {
    const fullKey = 'sk-ant-' + 'A'.repeat(50);
    // Split into 8 small chunks
    const stride = Math.ceil(fullKey.length / 8);
    const chunks: string[] = [];
    for (let i = 0; i < fullKey.length; i += stride) {
      chunks.push(fullKey.slice(i, i + stride));
    }
    chunks.unshift('here is the leaked key: ');
    chunks.push(' — please rotate.');
    const out = await drain(wrapStreamWithRedaction(fromChunks(chunks)));
    expect(out).toContain('[REDACTED:anthropic_key]');
    expect(out).not.toContain('sk-ant-');
  });

  it('redacts an RSA private key block spanning many chunks', async () => {
    const block = [
      '-----BEGIN RSA PRIVATE KEY-----\n',
      'MIIEowIBAAKCAQEA',
      'aaaabbbbccccdddd\n',
      'eeeeffffgggghhhh\n',
      '-----END RSA PRIVATE KEY-----',
    ];
    const out = await drain(wrapStreamWithRedaction(fromChunks(block)));
    expect(out).toContain('[REDACTED:rsa_private_key]');
    expect(out).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(out).not.toContain('END RSA PRIVATE KEY');
  });

  it('flushes the buffered tail on stream end', async () => {
    // The whole stream fits inside the lookback window; the wrapper must
    // still emit it when the source ends.
    const out = await drain(
      wrapStreamWithRedaction(fromChunks(['short prefix ', 'short suffix'])),
    );
    expect(out).toBe('short prefix short suffix');
  });

  it('fires onMatch with aggregate per-type counts at stream end', async () => {
    const onMatch = vi.fn();
    const stream = wrapStreamWithRedaction(
      fromChunks([
        'first leak AKIAIOSFODNN7EXAMPLE ',
        'second leak AKIAEXAMPLE12345ABCD ',
        'and ghp_' + 'a'.repeat(36),
      ]),
      onMatch,
    );
    await drain(stream);
    expect(onMatch).toHaveBeenCalledOnce();
    const matches: RedactionMatch[] = onMatch.mock.calls[0][0];
    const akiaMatch = matches.find((m) => m.type === 'aws_access_key');
    const ghMatch = matches.find((m) => m.type === 'github_token');
    expect(akiaMatch?.count).toBe(2);
    expect(ghMatch?.count).toBe(1);
  });

  it('does not invoke onMatch for clean streams (matches empty)', async () => {
    const onMatch = vi.fn();
    await drain(
      wrapStreamWithRedaction(
        fromChunks(['Routine alert summary, no secrets here.']),
        onMatch,
      ),
    );
    expect(onMatch).toHaveBeenCalledOnce();
    const matches: RedactionMatch[] = onMatch.mock.calls[0][0];
    expect(matches).toEqual([]);
  });
});
