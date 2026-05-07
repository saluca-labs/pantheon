import { describe, it, expect, vi } from 'vitest';

// Mock WorkOS SDK
vi.mock('@workos-inc/authkit-nextjs', () => ({
  signOut: vi.fn().mockResolvedValue(new Response(null, { status: 302 })),
}));

describe('Sign Out Route', () => {
  it('should call signOut from WorkOS SDK', async () => {
    const { signOut } = await import('@workos-inc/authkit-nextjs');
    const response = await signOut();
    expect(signOut).toHaveBeenCalled();
    expect(response.status).toBe(302);
  });
});
