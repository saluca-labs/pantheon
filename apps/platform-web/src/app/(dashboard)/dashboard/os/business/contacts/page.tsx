/**
 * Business OS — DEPRECATED contacts page.
 *
 * Phase 1 split the single contacts page into People / Organizations /
 * Recent activity at the new hub.  This page renders a brief loading
 * state and immediately redirects to `/dashboard/os/business`.
 *
 * Future removal: this file will be deleted once the redirect has been
 * live for one release.  Kept here to preserve any old external links.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { ContactsRedirect } from './contacts-redirect';

export const dynamic = 'force-dynamic';

export default function DeprecatedContactsPage() {
  return (
    <div className="max-w-2xl">
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 text-center">
        <h1 className="text-lg font-semibold text-white mb-2">
          Contacts CRM has moved
        </h1>
        <p className="text-sm text-[#94a3b8] mb-4">
          People, organizations, and interactions now live at the new
          Business OS hub.  Taking you there now…
        </p>
        <ContactsRedirect />
      </div>
    </div>
  );
}
