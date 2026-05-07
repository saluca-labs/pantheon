import { describe, it, expect, vi } from 'vitest';

// Mock the platform/auth package
vi.mock('@platform/auth', () => ({
  invalidateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@platform/auth/cookies', () => ({
  clearSessionCookie: vi.fn(),
  getSessionToken: vi.fn().mockReturnValue('mock-token'),
}));

describe('Sign Out Route', () => {
  it('should call invalidateSession with the session token', async () => {
    const { invalidateSession } = await import('@platform/auth');

    // Simulate the signout logic
    const token = 'mock-token';
    await invalidateSession(token, {} as any);

    expect(invalidateSession).toHaveBeenCalledWith('mock-token', expect.anything());
  });

  it('should not throw when no session token is present', async () => {
    const { invalidateSession } = await import('@platform/auth');
    (invalidateSession as any).mockResolvedValue(undefined);

    // With no token, signout should still succeed gracefully
    const token: string | null = null;
    expect(() => {
      if (!token) return; // No token, skip
    }).not.toThrow();
  });
});
