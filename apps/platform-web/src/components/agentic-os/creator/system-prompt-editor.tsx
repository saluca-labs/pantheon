'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';

interface SystemPromptEditorProps {
  value: string | null;
  onChange: (prompt: string) => void;
}

export function SystemPromptEditor({ value, onChange }: SystemPromptEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const handleSave = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleCancel = () => {
    setDraft(value ?? '');
    setOpen(false);
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        System Prompt {value ? '(set)' : ''}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Set a custom system prompt for this conversation..."
            rows={4}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 placeholder:text-zinc-500"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-md bg-fuchsia-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-fuchsia-500 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
