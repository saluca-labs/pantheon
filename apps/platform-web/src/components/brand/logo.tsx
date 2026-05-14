'use client';

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
        T
      </div>
      {!collapsed && (
        <span className="font-semibold text-white text-lg">Pantheon</span>
      )}
    </div>
  );
}
