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
import { Square } from 'lucide-react';

interface StopTimerButtonProps {
  entryId: string;
}

export default function StopTimerButton({ entryId }: StopTimerButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleStop() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/business/time-entries/${entryId}/stop`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to stop timer');
      }
      router.refresh();
    } catch {
      // silently handle — timer will refresh on next navigation
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleStop}
      disabled={loading}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-danger hover:bg-danger/90 text-white text-xs font-medium px-3 py-1.5 transition disabled:opacity-50"
    >
      <Square className="w-3 h-3" />
      {loading ? 'Stopping...' : 'Stop'}
    </button>
  );
}
