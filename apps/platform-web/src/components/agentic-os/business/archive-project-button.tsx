/**
 * MIT License
 *
 * Copyright (c) 2025 Saluca LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';

interface ArchiveProjectButtonProps {
  projectId: string;
}

export default function ArchiveProjectButton({ projectId }: ArchiveProjectButtonProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleArchive() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/business/projects/${projectId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to archive project');
      }
      router.push('/dashboard/os/business/projects');
      router.refresh();
    } catch {
      setConfirmed(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleArchive}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
        confirmed
          ? 'bg-red-600 border-red-600 text-white hover:bg-red-500'
          : 'border-red-900/50 text-red-400 hover:bg-red-900/20'
      }`}
    >
      <Archive className="w-4 h-4" />
      {loading ? 'Archiving...' : confirmed ? 'Click again to confirm' : 'Archive project'}
    </button>
  );
}
