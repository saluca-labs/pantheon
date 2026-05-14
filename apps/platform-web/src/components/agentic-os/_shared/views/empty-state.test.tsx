/**
 * Wave B.1 — EmptyState render + interaction tests.
 *
 * Covers: base render, icon defaulting, custom icon, illustration slot,
 * primary/secondary CTA (button + link forms), click handlers, and the
 * `card` vs `bare` variant.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Plus, FolderOpen } from 'lucide-react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(
      <EmptyState
        title="No deals yet"
        description="Add one to start your pipeline."
      />,
    );
    expect(screen.getByText('No deals yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add one to start your pipeline.'),
    ).toBeInTheDocument();
  });

  it('renders a default icon tile when no icon is supplied', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
  });

  it('renders a custom icon inside the icon tile', () => {
    const { container } = render(
      <EmptyState title="Empty" icon={<FolderOpen data-testid="custom-icon" />} />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    // svg lives inside the icon tile
    expect(
      screen.getByTestId('empty-state-icon').querySelector('svg'),
    ).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('renders an illustration in place of the icon tile', () => {
    render(
      <EmptyState
        title="Empty"
        illustration={<div data-testid="illo">art</div>}
      />,
    );
    expect(screen.getByTestId('illo')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-icon')).toBeNull();
  });

  it('renders no CTA row when neither CTA is supplied', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByTestId('empty-state-cta-primary')).toBeNull();
    expect(screen.queryByTestId('empty-state-cta-secondary')).toBeNull();
  });

  it('fires the primary CTA onClick handler', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        primaryCta={{ label: 'New deal', onClick, icon: <Plus /> }}
      />,
    );
    fireEvent.click(screen.getByTestId('empty-state-cta-primary'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText('New deal')).toBeInTheDocument();
  });

  it('renders the primary CTA as an anchor when href is supplied', () => {
    render(
      <EmptyState
        title="Empty"
        primaryCta={{ label: 'Go', href: '/dashboard/os/business/deals/new' }}
      />,
    );
    const cta = screen.getByTestId('empty-state-cta-primary');
    expect(cta.tagName).toBe('A');
    expect(cta).toHaveAttribute(
      'href',
      '/dashboard/os/business/deals/new',
    );
  });

  it('fires the secondary CTA onClick handler', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        primaryCta={{ label: 'New', onClick: () => {} }}
        secondaryCta={{ label: 'Seed sample data', onClick }}
      />,
    );
    fireEvent.click(screen.getByTestId('empty-state-cta-secondary'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies the bare variant (no dashed border classes)', () => {
    render(<EmptyState title="Empty" variant="bare" />);
    const root = screen.getByTestId('empty-state');
    expect(root.className).not.toContain('border-dashed');
  });

  it('applies the card variant by default (dashed border)', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByTestId('empty-state').className).toContain(
      'border-dashed',
    );
  });
});
