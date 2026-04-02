/**
 * @module IdPConfigForm
 *
 * OIDC Identity Provider configuration form for enterprise SSO setup.
 * Supports **create** and **edit** modes -- when an existing `idp` prop is
 * provided the form pre-fills fields and uses PUT to update; otherwise it
 * POSTs to create a new IdP entry.
 *
 * Supported providers: Google Workspace, Okta, Azure AD / Entra ID, Generic OIDC.
 * The discovery URL is auto-filled based on the selected provider template.
 */
"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { IdPConfig, OIDCProvider } from "@/lib/oidc";

// -- Types ------------------------------------------------------------------

interface IdPConfigFormProps {
  idp?: IdPConfig | null;
  onSaved: (idp: IdPConfig) => void;
  onDeleted?: (id: string) => void;
  onCancel?: () => void;
}

const PROVIDER_OPTIONS: { value: OIDCProvider; label: string }[] = [
  { value: "google", label: "Google Workspace" },
  { value: "okta", label: "Okta" },
  { value: "azure_ad", label: "Azure AD / Entra ID" },
  { value: "generic", label: "Generic OIDC" },
];

const PROVIDER_DISCOVERY_URLS: Partial<Record<OIDCProvider, string>> = {
  google: "https://accounts.google.com",
  okta: "https://{your-domain}.okta.com",
  azure_ad: "https://login.microsoftonline.com/{tenant-id}/v2.0",
};

// -- Component --------------------------------------------------------------

export function IdPConfigForm({
  idp,
  onSaved,
  onDeleted,
  onCancel,
}: IdPConfigFormProps) {
  const isEditing = Boolean(idp?.id);

  const [provider, setProvider] = useState<OIDCProvider>(idp?.provider ?? "generic");
  const [clientId, setClientId] = useState(idp?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [discoveryUrl, setDiscoveryUrl] = useState(idp?.discovery_url ?? "");
  const [domainHint, setDomainHint] = useState(idp?.domain_hint ?? "");
  const [displayName, setDisplayName] = useState(idp?.display_name ?? "");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Auto-fill discovery URL when provider changes
  const handleProviderChange = (value: OIDCProvider) => {
    setProvider(value);
    if (!isEditing || !discoveryUrl) {
      setDiscoveryUrl(PROVIDER_DISCOVERY_URLS[value] ?? "");
    }
  };

  /**
   * Test the IdP connection by calling POST `/v1/idp/{id}/test`.
   * Verifies that the discovery URL is reachable and the client credentials
   * are accepted by the upstream identity provider.
   */
  const handleTest = async () => {
    if (!idp?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      await api.post(`/v1/idp/${idp.id}/test`);
      setTestResult({ ok: true, message: "Connection successful — IdP is reachable." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Connection test failed.";
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  /**
   * Save the IdP configuration. Uses PUT for existing IdPs (edit mode)
   * and POST for new ones (create mode). The client_secret field is
   * omitted when blank in edit mode to preserve the existing secret.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const payload = {
      provider,
      client_id: clientId.trim(),
      client_secret: clientSecret.trim() || undefined,
      discovery_url: discoveryUrl.trim(),
      domain_hint: domainHint.trim() || null,
      display_name: displayName.trim(),
    };

    try {
      let saved: IdPConfig;
      if (isEditing && idp?.id) {
        saved = await api.put<IdPConfig>(`/v1/idp/${idp.id}`, payload);
      } else {
        saved = await api.post<IdPConfig>("/v1/idp", payload);
      }
      onSaved(saved);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save IdP configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!idp?.id || !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/v1/idp/${idp.id}`);
      onDeleted?.(idp.id);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete IdP configuration.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const inputClass =
    "w-full rounded-lg bg-of-surface-container-lowest border border-of-outline-variant/30 px-4 py-3 text-body-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50 focus:ring-1 focus:ring-of-primary/20 transition-colors";
  const labelClass = "block text-label-md text-of-on-surface-variant mb-2";

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {saveError && (
        <div className="rounded-xl bg-of-error-container/20 border border-of-error/30 p-4 text-body-sm text-of-error">
          {saveError}
        </div>
      )}

      {testResult && (
        <div
          className={`rounded-xl p-4 text-body-sm border ${
            testResult.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-of-error-container/20 border-of-error/30 text-of-error"
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Provider */}
      <div>
        <label className={labelClass}>Provider</label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as OIDCProvider)}
          className={inputClass}
          required
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Display Name */}
      <div>
        <label className={labelClass}>Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Corporate SSO"
          className={inputClass}
          required
        />
        <p className="mt-1 text-label-sm text-of-on-surface-variant/60">
          Shown on the sign-in button and email prompts.
        </p>
      </div>

      {/* Client ID */}
      <div>
        <label className={labelClass}>Client ID</label>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="your-client-id"
          className={inputClass + " font-mono"}
          required
        />
      </div>

      {/* Client Secret */}
      <div>
        <label className={labelClass}>
          Client Secret{" "}
          {isEditing && (
            <span className="text-label-sm text-of-on-surface-variant/40 font-normal">
              (leave blank to keep existing)
            </span>
          )}
        </label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={isEditing ? "••••••••" : "your-client-secret"}
          className={inputClass + " font-mono"}
          required={!isEditing}
          autoComplete="new-password"
        />
      </div>

      {/* Discovery URL */}
      <div>
        <label className={labelClass}>Discovery / Issuer URL</label>
        <input
          type="url"
          value={discoveryUrl}
          onChange={(e) => setDiscoveryUrl(e.target.value)}
          placeholder="https://accounts.google.com"
          className={inputClass}
          required
        />
        <p className="mt-1 text-label-sm text-of-on-surface-variant/60">
          The IdP&apos;s OIDC discovery endpoint base URL. Tiresias will append
          <code className="ml-1 text-of-primary/80">/.well-known/openid-configuration</code>.
        </p>
      </div>

      {/* Domain Hint */}
      <div>
        <label className={labelClass}>
          Domain Hint{" "}
          <span className="text-label-sm text-of-on-surface-variant/40 font-normal">
            (optional)
          </span>
        </label>
        <input
          type="text"
          value={domainHint}
          onChange={(e) => setDomainHint(e.target.value)}
          placeholder="yourcompany.com"
          className={inputClass}
        />
        <p className="mt-1 text-label-sm text-of-on-surface-variant/60">
          Email domain used to auto-detect this IdP on the login page.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-of-primary px-5 py-2.5 text-label-md font-semibold text-of-on-primary hover:bg-of-primary-fixed transition-all shadow-md shadow-of-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Identity Provider"}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-lg border border-of-outline-variant/40 bg-of-surface-container-high px-5 py-2.5 text-label-md font-semibold text-of-on-surface hover:bg-of-surface-container-highest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-of-outline-variant/30 px-5 py-2.5 text-label-md text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/60 transition-all"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Delete */}
      {isEditing && onDeleted && (
        <div className="pt-2 border-t border-of-outline-variant/20">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-body-sm text-of-error">
                This will permanently remove the IdP configuration. Are you sure?
              </p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-of-error px-4 py-2 text-label-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-of-outline-variant/30 px-4 py-2 text-label-sm text-of-on-surface-variant hover:text-of-on-surface transition-all"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-label-sm text-of-on-surface-variant/50 hover:text-of-error transition-colors"
            >
              Remove this identity provider
            </button>
          )}
        </div>
      )}
    </form>
  );
}
