import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Wave E.3 — `DashboardHub`'s feature grid was extracted into a client
// component that calls `useRouter()` to drive view-transition-wrapped
// navigation. Tests that render `DashboardHub` from outside its own test
// file (research / business / autobiographer / creator / cyber / filmmaker
// hub-converge suites etc.) need a router context, otherwise Next throws
// "invariant expected app router to be mounted". Provide a stub here so
// every hub-rendering test gets a router for free. Individual test files
// may still override `vi.mock('next/navigation', ...)` to assert on the
// router's push/replace if they need that depth.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
