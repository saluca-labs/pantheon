"use client";

import Link from "next/link";

export default function SoulWatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-zinc-900/80 border border-red-500/20 rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-red-400 text-sm font-mono uppercase tracking-wider">SoulWatch Error</div>
        <p className="text-zinc-300 text-sm">{error.message || "An unexpected error occurred."}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="px-4 py-2 bg-teal-600/20 text-teal-400 border border-teal-500/30 rounded-lg text-sm hover:bg-teal-600/30 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
