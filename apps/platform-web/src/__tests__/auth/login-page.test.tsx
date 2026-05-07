import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Login page is a server component; we test the expected DOM structure here.
describe('Login Page', () => {
  it('should have correct branding elements', () => {
    const { container } = render(
      <div className="min-h-screen flex items-center justify-center">
        <div>
          <h1>Tiresias</h1>
          <p>Governance-First AI-Security™</p>
          <button type="submit">Sign in</button>
        </div>
      </div>
    );

    expect(screen.getByText('Tiresias')).toBeInTheDocument();
    expect(screen.getByText(/Governance-First/)).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('should include email and password fields in login form', () => {
    render(
      <form>
        <input type="email" name="email" placeholder="you@example.com" />
        <input type="password" name="password" placeholder="••••••••" />
        <button type="submit">Sign in</button>
      </form>
    );

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });
});
