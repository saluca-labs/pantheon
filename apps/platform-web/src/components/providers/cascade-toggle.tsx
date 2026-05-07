'use client';

import { useRBAC } from '@/lib/rbac/context';
import { Role } from '@/lib/rbac/permissions';

const STORAGE_KEY = 'tiresias:showCascade';

interface CascadeToggleProps {
  value: boolean;
  onChange: (show: boolean) => void;
}

/**
 * D-10: Admin toggle for cascade order visibility.
 * Only renders for admin users. Persists preference in localStorage.
 */
export function CascadeToggle({ value, onChange }: CascadeToggleProps) {
  const { role } = useRBAC();

  // Only admins can toggle cascade visibility
  if (role !== Role.ADMIN) {
    return null;
  }

  const handleToggle = () => {
    const next = !value;
    onChange(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (SSR, private browsing, etc.)
    }
  };

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 text-sm text-[#94a3b8] hover:text-white transition-colors"
      aria-pressed={value}
      title="Toggle cascade order visibility"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? 'bg-[#4361EE]' : 'bg-[#2a2d3e]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span>Show cascade order</span>
    </button>
  );
}

/** Read cascade preference from localStorage */
export function readCascadePreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return JSON.parse(stored);
  } catch {
    // localStorage unavailable
  }
  return true; // Default: show cascade
}
