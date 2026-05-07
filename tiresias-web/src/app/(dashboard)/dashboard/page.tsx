import { Shield } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Policy Dashboard</h1>
      </div>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
        <p className="text-[#94a3b8] text-lg mb-2">
          Governance-First AI-Security&trade;
        </p>
        <p className="text-[#94a3b8]/60 text-sm">
          Policy management, enforcement status, and violation tracking will appear here.
        </p>
        <p className="text-[#94a3b8]/40 text-xs mt-4">
          Phase 3 delivers the full policy dashboard.
        </p>
      </div>
    </div>
  );
}
