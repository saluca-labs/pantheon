import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/dashboard'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Shield: () => <span data-testid="icon-shield" />,
  ScrollText: () => <span data-testid="icon-scroll" />,
  DollarSign: () => <span data-testid="icon-dollar" />,
  Activity: () => <span data-testid="icon-activity" />,
  Bell: () => <span data-testid="icon-bell" />,
  Key: () => <span data-testid="icon-key" />,
  Settings: () => <span data-testid="icon-settings" />,
}));

import { Sidebar, navItems } from '@/components/layout/sidebar';

describe('Sidebar', () => {
  it('renders all 7 navigation items', () => {
    render(<Sidebar />);
    expect(navItems).toHaveLength(7);
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('marks Policy as active when on /dashboard', () => {
    render(<Sidebar />);
    const policyLink = screen.getByText('Policy').closest('a');
    expect(policyLink?.className).toContain('text-[#4361EE]');
  });

  it('disables non-implemented nav items', () => {
    render(<Sidebar />);
    const sessionsLink = screen.getByText('Sessions').closest('a');
    expect(sessionsLink?.getAttribute('aria-disabled')).toBe('true');
  });
});
