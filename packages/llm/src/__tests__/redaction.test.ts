import { describe, it, expect } from 'vitest';
import { redact } from '../redact.js';

describe('redact', () => {
  it('scrubs emails', () => {
    expect(redact({ msg: 'contact alice@example.com' })).toEqual({
      msg: 'contact [REDACTED:email]',
    });
  });

  it('scrubs JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdef';
    expect((redact({ token: jwt }) as { token: string }).token).toBe('[REDACTED]');
    expect((redact({ note: `auth=${jwt}` }) as { note: string }).note).toContain('[REDACTED:jwt]');
  });

  it('scrubs Bearer tokens', () => {
    expect((redact({ h: 'Bearer abc123def' }) as { h: string }).h).toContain('[REDACTED:bearer]');
  });

  it('scrubs password keys recursively', () => {
    expect(redact({ inner: { password: 'hunter2' } })).toEqual({
      inner: { password: '[REDACTED]' },
    });
  });

  it('leaves clean strings alone', () => {
    expect(redact({ msg: 'hello world' })).toEqual({ msg: 'hello world' });
  });
});
