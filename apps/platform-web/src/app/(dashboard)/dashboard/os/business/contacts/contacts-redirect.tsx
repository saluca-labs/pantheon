'use client';

/**
 * Business OS — Phase 1 deprecation redirect.
 *
 * 100ms client-side hop to the new hub. Server-side `redirect()` would
 * be cleaner but the spec calls for a brief client-side loading state
 * so the user can read the deprecation banner.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ContactsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace('/dashboard/os/business'), 100);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <p className="text-xs text-[#94a3b8]/70">
      Redirecting to <span className="text-white">/dashboard/os/business</span>…
    </p>
  );
}
