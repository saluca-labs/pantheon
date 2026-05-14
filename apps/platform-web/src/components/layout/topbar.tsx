'use client';

interface TopbarProps {
  userEmail?: string;
  displayName?: string | null;
}

export function Topbar({ userEmail, displayName }: TopbarProps) {
  const displayLabel = displayName ?? userEmail ?? '';

  return (
    <header className="h-14 border-b border-border-subtle bg-surface-2 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="md:hidden">
        {/* Mobile nav trigger handled by mobile-nav.tsx */}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        {displayLabel && (
          <>
            <span className="text-sm text-text-secondary">
              {displayLabel}
            </span>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="text-xs text-text-secondary hover:text-white transition-colors px-3 py-1 rounded border border-border-subtle hover:border-accent"
              >
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
