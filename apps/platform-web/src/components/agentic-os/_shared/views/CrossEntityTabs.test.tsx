/**
 * CrossEntityTabs — Wave B.2 data-view primitive tests.
 *
 * Covers: render tab strip, count badges, default tab, tab switch, lazy
 * content (only-mounted-when-opened, then sticky), controlled mode,
 * keyboard navigation, disabled tab, empty-tabs fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrossEntityTabs, type CrossEntityTab } from './CrossEntityTabs';

function mkTabs(spies?: {
  quotes?: () => void;
  invoices?: () => void;
}): CrossEntityTab[] {
  return [
    {
      key: 'quotes',
      label: 'Quotes',
      count: 3,
      content: () => {
        spies?.quotes?.();
        return <div data-testid="panel-quotes-content">quotes body</div>;
      },
    },
    {
      key: 'invoices',
      label: 'Invoices',
      count: 0,
      content: () => {
        spies?.invoices?.();
        return <div data-testid="panel-invoices-content">invoices body</div>;
      },
    },
    {
      key: 'time',
      label: 'Time',
      content: () => <div data-testid="panel-time-content">time body</div>,
    },
  ];
}

describe('CrossEntityTabs — render', () => {
  it('renders a tab per entry', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    expect(screen.getByTestId('cross-entity-tab-quotes')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-invoices')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-time')).toBeInTheDocument();
  });

  it('renders count badges, including a zero count', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    expect(
      screen.getByTestId('cross-entity-tab-count-quotes'),
    ).toHaveTextContent('3');
    expect(
      screen.getByTestId('cross-entity-tab-count-invoices'),
    ).toHaveTextContent('0');
  });

  it('omits the badge for a tab with no count', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    expect(
      screen.queryByTestId('cross-entity-tab-count-time'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty fallback when tabs is empty', () => {
    render(<CrossEntityTabs tabs={[]} />);
    expect(screen.getByTestId('cross-entity-tabs-empty')).toBeInTheDocument();
  });
});

describe('CrossEntityTabs — default tab', () => {
  it('activates the first tab by default', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    expect(screen.getByTestId('cross-entity-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('honors defaultTab', () => {
    render(<CrossEntityTabs tabs={mkTabs()} defaultTab="invoices" />);
    expect(screen.getByTestId('cross-entity-tab-invoices')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back to first tab when defaultTab is unknown', () => {
    render(<CrossEntityTabs tabs={mkTabs()} defaultTab="nope" />);
    expect(screen.getByTestId('cross-entity-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('CrossEntityTabs — switching + lazy content', () => {
  it('only renders the active tab content panel as visible', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    expect(screen.getByTestId('cross-entity-panel-quotes')).not.toHaveAttribute(
      'hidden',
    );
  });

  it('does NOT invoke an unopened tab content render-prop', () => {
    const invoices = vi.fn();
    render(<CrossEntityTabs tabs={mkTabs({ invoices })} />);
    expect(invoices).not.toHaveBeenCalled();
  });

  it('invokes a tab content render-prop only after it is opened', () => {
    const invoices = vi.fn();
    render(<CrossEntityTabs tabs={mkTabs({ invoices })} />);
    fireEvent.click(screen.getByTestId('cross-entity-tab-invoices'));
    expect(invoices).toHaveBeenCalled();
    expect(
      screen.getByTestId('panel-invoices-content'),
    ).toBeInTheDocument();
  });

  it('keeps a previously-opened panel mounted after switching away', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    fireEvent.click(screen.getByTestId('cross-entity-tab-invoices'));
    fireEvent.click(screen.getByTestId('cross-entity-tab-quotes'));
    // invoices panel still in the DOM, just hidden
    expect(screen.getByTestId('cross-entity-panel-invoices')).toHaveAttribute(
      'hidden',
    );
    expect(
      screen.getByTestId('panel-invoices-content'),
    ).toBeInTheDocument();
  });
});

describe('CrossEntityTabs — controlled mode', () => {
  it('reflects the activeKey prop and fires onTabChange', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <CrossEntityTabs
        tabs={mkTabs()}
        activeKey="quotes"
        onTabChange={onTabChange}
      />,
    );
    fireEvent.click(screen.getByTestId('cross-entity-tab-time'));
    expect(onTabChange).toHaveBeenCalledWith('time');
    // still showing quotes — parent hasn't updated activeKey
    expect(screen.getByTestId('cross-entity-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    rerender(
      <CrossEntityTabs
        tabs={mkTabs()}
        activeKey="time"
        onTabChange={onTabChange}
      />,
    );
    expect(screen.getByTestId('cross-entity-tab-time')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('CrossEntityTabs — keyboard navigation', () => {
  it('ArrowRight moves to the next tab', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    const first = screen.getByTestId('cross-entity-tab-quotes');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByTestId('cross-entity-tab-invoices')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('ArrowLeft wraps from the first tab to the last', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    const first = screen.getByTestId('cross-entity-tab-quotes');
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByTestId('cross-entity-tab-time')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('End jumps to the last tab', () => {
    render(<CrossEntityTabs tabs={mkTabs()} />);
    fireEvent.keyDown(screen.getByTestId('cross-entity-tab-quotes'), {
      key: 'End',
    });
    expect(screen.getByTestId('cross-entity-tab-time')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('CrossEntityTabs — disabled tab', () => {
  it('does not select a disabled tab on click', () => {
    const tabs: CrossEntityTab[] = [
      { key: 'a', label: 'A', content: () => <div>a</div> },
      {
        key: 'b',
        label: 'B',
        disabled: true,
        content: () => <div>b</div>,
      },
    ];
    render(<CrossEntityTabs tabs={tabs} />);
    fireEvent.click(screen.getByTestId('cross-entity-tab-b'));
    expect(screen.getByTestId('cross-entity-tab-a')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keyboard navigation skips a disabled tab', () => {
    const tabs: CrossEntityTab[] = [
      { key: 'a', label: 'A', content: () => <div>a</div> },
      {
        key: 'b',
        label: 'B',
        disabled: true,
        content: () => <div>b</div>,
      },
      { key: 'c', label: 'C', content: () => <div>c</div> },
    ];
    render(<CrossEntityTabs tabs={tabs} />);
    fireEvent.keyDown(screen.getByTestId('cross-entity-tab-a'), {
      key: 'ArrowRight',
    });
    expect(screen.getByTestId('cross-entity-tab-c')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
