import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/dashboard'),
}));

// Mock lucide-react icons used by sidebar + registry. We list every icon
// referenced in apps/platform-web/src/lib/agentic-os/registry.ts and the
// sidebar itself. If a new icon is added, append it here.
vi.mock('lucide-react', () => {
  const make = (name: string) => {
    const C = () => <span data-testid={`icon-${name}`} />;
    C.displayName = name;
    return C;
  };
  const names = [
    // Sidebar core
    'Shield', 'ScrollText', 'DollarSign', 'Activity', 'Bell', 'Key',
    'Settings', 'ChevronDown', 'ChevronRight', 'Cpu', 'Menu', 'X',
    'SlidersHorizontal',
    'ClipboardList',
    'MessagesSquare',
    // Agentic OS registry icons
    'HeartPulse', 'Wrench', 'FlaskConical', 'ShieldCheck', 'Clapperboard',
    'ShieldAlert', 'BookOpenText', 'Briefcase', 'Sparkles',
  ];
  const stubs: Record<string, ReturnType<typeof make>> = {};
  for (const n of names) stubs[n] = make(n);
  return stubs;
});

import { Sidebar, navItems } from '@/components/layout/sidebar';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

describe('Sidebar', () => {
  it('renders the 8 Tiresias core navigation items (incl. Matrix Console)', () => {
    render(<Sidebar />);
    expect(navItems).toHaveLength(8);
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Matrix Console')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('Matrix Console nav link points at /dashboard/matrix-console and is enabled', () => {
    render(<Sidebar />);
    const link = screen.getByText('Matrix Console').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/dashboard/matrix-console');
    expect(link?.getAttribute('aria-disabled')).toBe('false');
  });

  it('renders the Agentic OS section header', () => {
    render(<Sidebar />);
    expect(screen.getByText('Agentic OS')).toBeInTheDocument();
  });

  it('renders one entry per registered Agentic OS module when expanded', () => {
    render(<Sidebar />);
    // Group is closed by default off-route, so click to expand.
    const toggle = screen.getByText('Agentic OS').closest('button');
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);
    for (const m of AGENTIC_OS_MODULES) {
      expect(screen.getAllByText(m.label).length).toBeGreaterThan(0);
    }
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

  it('exposes an Audit log entry inside the Agentic OS group', () => {
    render(<Sidebar />);
    const toggle = screen.getByText('Agentic OS').closest('button');
    fireEvent.click(toggle!);
    const auditLink = screen.getByText('Audit log').closest('a');
    expect(auditLink).not.toBeNull();
    expect(auditLink?.getAttribute('href')).toBe('/dashboard/os/audit');
    expect(auditLink?.getAttribute('aria-disabled')).toBe('false');
  });

  it('exposes an OS Settings entry inside the Agentic OS group', () => {
    render(<Sidebar />);
    const toggle = screen.getByText('Agentic OS').closest('button');
    fireEvent.click(toggle!);
    const settingsLink = screen.getByText('OS Settings').closest('a');
    expect(settingsLink).not.toBeNull();
    expect(settingsLink?.getAttribute('href')).toBe('/dashboard/os/settings');
    expect(settingsLink?.getAttribute('aria-disabled')).toBe('false');
  });

  it('filters Agentic OS items to enabledSlugs when provided', () => {
    render(<Sidebar enabledSlugs={['health', 'maker']} />);
    const toggle = screen.getByText('Agentic OS').closest('button');
    fireEvent.click(toggle!);
    // Health and Maker should appear; Cyber should not.
    const healthMod = AGENTIC_OS_MODULES.find((m) => m.slug === 'health')!;
    const cyberMod = AGENTIC_OS_MODULES.find((m) => m.slug === 'cyber')!;
    expect(screen.getAllByText(healthMod.label).length).toBeGreaterThan(0);
    expect(screen.queryByText(cyberMod.label)).toBeNull();
    // OS Settings and Audit log always present.
    expect(screen.getByText('OS Settings')).toBeInTheDocument();
    expect(screen.getByText('Audit log')).toBeInTheDocument();
  });
});
