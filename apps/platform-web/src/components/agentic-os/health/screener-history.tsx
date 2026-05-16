import { BrainCircuit } from 'lucide-react';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import type { ScreenerRow } from '@/lib/agentic-os/health/repo';

interface Props {
  items: ScreenerRow[];
}

const SEVERITY_LABEL: Record<string, string> = {
  minimal: 'Minimal',
  mild: 'Mild',
  moderate: 'Moderate',
  moderately_severe: 'Moderately severe',
  severe: 'Severe',
};

const SEVERITY_CLASS: Record<string, string> = {
  minimal: 'text-positive',
  mild: 'text-positive',
  moderate: 'text-warning',
  moderately_severe: 'text-attention',
  severe: 'text-danger',
};

export function ScreenerHistory({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        variant="bare"
        icon={<BrainCircuit className="h-6 w-6" />}
        title="No screeners submitted yet"
        description="Take a PHQ-9 or GAD-7 above to start your timeline."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
            <th className="py-2 pr-4 font-normal">Date</th>
            <th className="py-2 pr-4 font-normal">Screener</th>
            <th className="py-2 pr-4 font-normal">Score</th>
            <th className="py-2 pr-4 font-normal">Severity</th>
            <th className="py-2 pr-4 font-normal">Flag</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="border-t border-border-subtle">
              <td className="py-2 pr-4 text-text-primary">
                {new Date(row.createdAt).toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-white uppercase">{row.screener}</td>
              <td className="py-2 pr-4 text-white font-medium">{row.score}</td>
              <td className={`py-2 pr-4 font-medium ${SEVERITY_CLASS[row.severity] ?? 'text-white'}`}>
                {SEVERITY_LABEL[row.severity] ?? row.severity}
              </td>
              <td className="py-2 pr-4">
                {row.crisisFlag ? (
                  <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30">
                    Safety prompt
                  </span>
                ) : (
                  <span className="text-xs text-text-secondary/70">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
