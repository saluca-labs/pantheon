'use client';

/**
 * Business OS Phase 1 — archive / restore toggle for org-detail header.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  organizationId: string;
  archived: boolean;
}

export function OrganizationArchiveButton({ organizationId, archived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (busy) return;
    setBusy(true);
    try {
      if (archived) {
        const r = await fetch(
          `/api/tiresias/agentic-os/business/organizations/${organizationId}/restore`,
          { method: 'POST' },
        );
        if (!r.ok) throw new Error(`Restore failed (${r.status})`);
      } else {
        const r = await fetch(
          `/api/tiresias/agentic-os/business/organizations/${organizationId}`,
          { method: 'DELETE' },
        );
        if (!r.ok) throw new Error(`Archive failed (${r.status})`);
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-border-subtle text-xs text-text-secondary hover:text-white hover:border-accent transition px-3 py-1.5 disabled:opacity-50"
    >
      {busy ? '…' : archived ? 'Restore organization' : 'Archive organization'}
    </button>
  );
}
