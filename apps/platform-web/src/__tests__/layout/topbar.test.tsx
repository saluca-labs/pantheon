import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Topbar } from '@/components/layout/topbar';

describe('Topbar', () => {
  it('renders display name when provided', () => {
    render(<Topbar userEmail="cristian@saluca.com" displayName="Cristian" />);
    expect(screen.getByText('Cristian')).toBeInTheDocument();
  });

  it('falls back to email when display name is absent', () => {
    render(<Topbar userEmail="cristian@saluca.com" />);
    expect(screen.getByText('cristian@saluca.com')).toBeInTheDocument();
  });

  it('renders sign out button with form action', () => {
    render(<Topbar userEmail="cristian@saluca.com" displayName="Cristian" />);
    const signOutButton = screen.getByText('Sign out');
    expect(signOutButton).toBeInTheDocument();
    const form = signOutButton.closest('form');
    expect(form?.getAttribute('action')).toBe('/auth/signout');
    expect(form?.getAttribute('method')).toBe('POST');
  });

  it('renders nothing when no user is provided', () => {
    render(<Topbar />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});
