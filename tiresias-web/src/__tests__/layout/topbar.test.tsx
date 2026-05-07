import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock WorkOS SDK
vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: {
      email: 'cristian@saluca.com',
      firstName: 'Cristian',
    },
  }),
}));

import { Topbar } from '@/components/layout/topbar';

describe('Topbar', () => {
  it('renders user name', () => {
    render(<Topbar />);
    expect(screen.getByText('Cristian')).toBeInTheDocument();
  });

  it('renders sign out button with form action', () => {
    render(<Topbar />);
    const signOutButton = screen.getByText('Sign out');
    expect(signOutButton).toBeInTheDocument();
    const form = signOutButton.closest('form');
    expect(form?.getAttribute('action')).toBe('/auth/signout');
    expect(form?.getAttribute('method')).toBe('POST');
  });
});
