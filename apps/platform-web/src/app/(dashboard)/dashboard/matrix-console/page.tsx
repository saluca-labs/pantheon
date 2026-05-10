/**
 * Matrix Console (V-08).
 *
 * Embeds Element Web into the dashboard for primary-human users. The
 * Compose `matrix` profile must be running for the iframe to load (see
 * apps/matrix-bridge/element/README.md). Non-admin roles see a
 * "restricted" card instead of the iframe.
 *
 * @license Apache-2.0 — part of the Tiresias matrix bridge integration.
 */

import { MessagesSquare, ShieldAlert } from 'lucide-react';
import { Role } from '@/lib/rbac/permissions';
import { RoleGate } from '@/components/rbac/role-gate';

export const metadata = {
  title: 'Matrix Console — Pantheon',
  description: 'Embedded Element Web client for primary-human Matrix rooms.',
};

const DEFAULT_CONSOLE_URL = '/_matrix/element/';

export default function MatrixConsolePage() {
  // Same-origin by default via the Next.js rewrite in next.config.ts.
  // Operators can override with NEXT_PUBLIC_MATRIX_CONSOLE_URL when the
  // platform-web deployment lives behind a different ingress (e.g. a
  // dedicated matrix.example.com hostname); in that case we don't sandbox
  // away `allow-same-origin` because Element needs cookies/IndexedDB to
  // hold the user's session.
  const consoleUrl =
    process.env['NEXT_PUBLIC_MATRIX_CONSOLE_URL'] ?? DEFAULT_CONSOLE_URL;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessagesSquare className="w-6 h-6 text-[#4361EE]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Matrix Console</h1>
            <p className="text-sm text-[#94a3b8]">
              Element Web embed — primary-human rooms only.
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
          Preview
        </span>
      </div>

      <RoleGate
        allowedRoles={[Role.ADMIN]}
        fallback={<MatrixConsoleRestricted />}
      >
        <MatrixConsoleFrame consoleUrl={consoleUrl} />
      </RoleGate>
    </div>
  );
}

interface MatrixConsoleFrameProps {
  consoleUrl: string;
}

function MatrixConsoleFrame({ consoleUrl }: MatrixConsoleFrameProps) {
  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-[#2a2d3e] flex items-center justify-between text-xs text-[#94a3b8]">
        <span>
          Pinned to internal homeserver{' '}
          <code className="text-[#4361EE]">tiresias.local</code> · federation
          disabled
        </span>
        <a
          href={consoleUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-white"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        title="Matrix Console (Element Web)"
        data-testid="matrix-console-iframe"
        src={consoleUrl}
        // Element needs same-origin (IndexedDB + cookies) to persist
        // the user's session and crypto keys; we still keep
        // `allow-top-navigation` off so a compromised Element build
        // cannot navigate the parent dashboard away.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        referrerPolicy="strict-origin"
        // 100vh minus dashboard chrome (topbar + container padding).
        // Tuned to the same-origin embed; if you mount Element under a
        // different ingress you may need to adjust.
        className="w-full h-[calc(100vh-12rem)] bg-[#0f1117] border-0"
      />
    </div>
  );
}

function MatrixConsoleRestricted() {
  return (
    <div
      data-testid="matrix-console-restricted"
      className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-8 flex items-start gap-4"
    >
      <ShieldAlert className="w-8 h-8 text-amber-400 shrink-0" />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">
          Restricted to primary humans
        </h2>
        <p className="text-sm text-[#94a3b8] max-w-2xl">
          The Matrix console is reserved for the primary human in this
          tenant — typically the org admin. Sub-users and viewers cannot
          load Element Web from inside the dashboard. If you believe you
          should have access, ask your tenant admin to elevate your role
          via{' '}
          <a
            href="/dashboard/settings/members"
            className="text-[#4361EE] hover:underline"
          >
            Settings → Members
          </a>
          .
        </p>
        <p className="text-xs text-[#94a3b8]/70">
          See{' '}
          <code className="text-[#94a3b8]">
            apps/platform-app-proxy/policies/cedar/matrix.cedar
          </code>{' '}
          for the underlying primary-only access policy (matrix-003).
        </p>
      </div>
    </div>
  );
}
