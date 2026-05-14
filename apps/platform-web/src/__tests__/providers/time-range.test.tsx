import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimeRangeSelector } from '@/components/providers/time-range-selector';

describe('TimeRangeSelector', () => {
  it('renders all four time range options', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value="24h" onChange={onChange} />);

    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('calls onChange with the correct value when clicked', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value="24h" onChange={onChange} />);

    fireEvent.click(screen.getByText('7d'));
    expect(onChange).toHaveBeenCalledWith('7d');

    fireEvent.click(screen.getByText('1h'));
    expect(onChange).toHaveBeenCalledWith('1h');
  });

  it('applies accent styling to the active time range', () => {
    // Asserts on the design-token class (Wave A migration replaced the
    // literal `#4361EE` hex with the `accent` semantic token).
    const onChange = vi.fn();
    render(<TimeRangeSelector value="7d" onChange={onChange} />);

    const activeButton = screen.getByText('7d');
    expect(activeButton.className).toContain('text-accent');

    const inactiveButton = screen.getByText('1h');
    expect(inactiveButton.className).not.toContain('text-accent');
  });

  it('sets aria-pressed on the active button', () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value="30d" onChange={onChange} />);

    expect(screen.getByText('30d')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1h')).toHaveAttribute('aria-pressed', 'false');
  });
});
