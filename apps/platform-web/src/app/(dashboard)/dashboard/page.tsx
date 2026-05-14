import { Shield } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Policy Dashboard</h1>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-8 text-center">
        <p className="text-text-secondary text-lg mb-2">
          Governance-First AI-Security&trade;
        </p>
        <p className="text-text-secondary/60 text-sm">
          Policy management, enforcement status, and violation tracking will appear here.
        </p>
        <p className="text-text-secondary/40 text-xs mt-4">
          Phase 3 delivers the full policy dashboard.
        </p>
      </div>
    </div>
  );
}
