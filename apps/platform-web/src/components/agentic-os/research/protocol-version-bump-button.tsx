'use client';

/**
 * Research OS Phase 5 — version-bump button that toggles the inline form.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { GitBranchPlus } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import { ProtocolVersionBumpForm } from './protocol-version-bump-form';

interface Props {
  source: Protocol;
}

export function ProtocolVersionBumpButton({ source }: Props) {
  const [open, setOpen] = useState(false);
  if (open) {
    return <ProtocolVersionBumpForm source={source} onClose={() => setOpen(false)} />;
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#4361EE]/40 text-[#4361EE] hover:bg-[#4361EE]/10 transition"
      data-testid="protocol-version-bump-button"
    >
      <GitBranchPlus className="w-3.5 h-3.5" />
      Bump version
    </button>
  );
}
