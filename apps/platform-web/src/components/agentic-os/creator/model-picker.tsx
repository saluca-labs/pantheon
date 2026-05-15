'use client';

import { ChevronDown } from 'lucide-react';

interface ModelOption {
  value: string;
  label: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'ollama/deepseek-v3.2:cloud', label: 'DeepSeek V3.2 (Ollama)' },
  {
    value: 'ollama/qwen3-coder:30b-a3b-q4_K_M',
    label: 'Qwen3 Coder (Ollama)',
  },
];

interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelPicker({ value, onChange }: ModelPickerProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full rounded-md border border-border-strong bg-surface-2 text-text-primary text-sm pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-os-creator/50 cursor-pointer"
      >
        {MODEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
    </div>
  );
}
