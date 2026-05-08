import { SlidersHorizontal } from 'lucide-react';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';
import { getCurrentFlagsUser } from '@/lib/agentic-os/flags/session';
import { getFlags } from '@/lib/agentic-os/flags/repo';
import { FlagsToggleList } from '@/components/agentic-os/settings/flags-toggle-list';

/**
 * Agentic OS Settings page — per-user feature flags.
 *
 * This is a server component that fetches initial flag state and passes it
 * to the client toggle list component.
 */
export default async function AgenticOsSettingsPage() {
  const user = await getCurrentFlagsUser();

  // Seed all-true defaults if unauthenticated (layout guard prevents this,
  // but keeps TypeScript happy and avoids a hard crash).
  const flags = user
    ? await getFlags(user.userId)
    : Object.fromEntries(AGENTIC_OS_MODULES.map((m) => [m.slug, true]));

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <SlidersHorizontal className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">OS Settings</h1>
      </div>
      <p className="text-[#94a3b8] mb-8">
        Toggle Agentic OS modules on or off. Disabled modules are hidden from
        your sidebar and dashboard — your data is always preserved.
      </p>

      <FlagsToggleList modules={AGENTIC_OS_MODULES} initialFlags={flags} />
    </div>
  );
}
