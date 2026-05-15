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
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2/50 transition-colors"
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
            className="w-full rounded-md border border-border-strong bg-surface-1 text-text-primary text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-os-creator/50 placeholder:text-text-tertiary"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-md bg-os-creator px-2.5 py-1 text-xs font-medium text-white hover:bg-os-creator/90 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-border-strong transition-colors"
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
