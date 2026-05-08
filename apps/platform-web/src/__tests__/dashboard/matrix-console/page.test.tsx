/**
 * Matrix Console (V-08) — page tests.
 *
 * @license Apache-2.0 — part of the Tiresias matrix bridge integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub lucide icons referenced by the page so we don't drag the real
// SVGs into jsdom.
vi.mock('lucide-react', () => {
  const make = (name: string) => {
    const C = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    C.displayName = name;
    return C;
  };
  return {
    MessagesSquare: make('MessagesSquare'),
    ShieldAlert: make('ShieldAlert'),
  };
});

import MatrixConsolePage from '@/app/(dashboard)/dashboard/matrix-console/page';
import { RBACProvider } from '@/lib/rbac/context';
import { Role } from '@/lib/rbac/permissions';

function renderAs(role: Role) {
  return render(
    <RBACProvider role={role} permissions={[]} userId="user_123">
      <MatrixConsolePage />
    </RBACProvider>,
  );
}

describe('MatrixConsolePage (V-08)', () => {
  const originalConsoleUrl = process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'];

  beforeEach(() => {
    delete process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'];
  });

  afterEach(() => {
    if (originalConsoleUrl !== undefined) {
      process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'] = originalConsoleUrl;
    } else {
      delete process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'];
    }
  });

  it('renders the page header for any role', () => {
    renderAs(Role.VIEWER);
    expect(screen.getByText('Matrix Console')).toBeDefined();
    expect(
      screen.getByText(/Element Web embed/i),
    ).toBeDefined();
  });

  it('renders the Element iframe for admin role', () => {
    renderAs(Role.ADMIN);
    const frame = screen.getByTestId('matrix-console-iframe') as HTMLIFrameElement;
    expect(frame).toBeDefined();
    expect(frame.tagName).toBe('IFRAME');
    expect(screen.queryByTestId('matrix-console-restricted')).toBeNull();
  });

  it('iframe defaults to /_matrix/element/ (same-origin rewrite)', () => {
    renderAs(Role.ADMIN);
    const frame = screen.getByTestId('matrix-console-iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('/_matrix/element/');
  });

  it('iframe carries the expected sandbox + referrer policy', () => {
    renderAs(Role.ADMIN);
    const frame = screen.getByTestId('matrix-console-iframe') as HTMLIFrameElement;
    const sandbox = frame.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).toContain('allow-forms');
    expect(sandbox).toContain('allow-popups');
    // Sandbox must NOT grant top-navigation; otherwise a compromised
    // Element bundle could navigate the parent dashboard away.
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin');
  });

  it('iframe src honours NEXT_PUBLIC_MATRIX_CONSOLE_URL override', () => {
    process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'] = 'https://element.example.com/';
    renderAs(Role.ADMIN);
    const frame = screen.getByTestId('matrix-console-iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('https://element.example.com/');
  });

  it('renders the restricted card for member role', () => {
    renderAs(Role.MEMBER);
    expect(screen.getByTestId('matrix-console-restricted')).toBeDefined();
    expect(screen.queryByTestId('matrix-console-iframe')).toBeNull();
    expect(screen.getByText(/Restricted to primary humans/i)).toBeDefined();
  });

  it('renders the restricted card for viewer role', () => {
    renderAs(Role.VIEWER);
    expect(screen.getByTestId('matrix-console-restricted')).toBeDefined();
    expect(screen.queryByTestId('matrix-console-iframe')).toBeNull();
  });

  it('restricted card links back to Settings → Members for elevation', () => {
    renderAs(Role.MEMBER);
    const link = screen.getByText('Settings → Members').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/dashboard/settings/members');
  });
});
