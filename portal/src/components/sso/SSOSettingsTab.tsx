"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import type { IdPConfig } from "@/lib/oidc";
import { IdPConfigForm } from "./IdPConfigForm";

// -- Types ------------------------------------------------------------------

type ViewState = "list" | "create" | "edit";

// -- Component --------------------------------------------------------------

export function SSOSettingsTab() {
  const [idps, setIdps] = useState<IdPConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("list");
  const [editingIdp, setEditingIdp] = useState<IdPConfig | null>(null);

  const fetchIdps = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await api.get<{ idps: IdPConfig[] }>("/v1/idp");
      setIdps(data.idps ?? []);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.message : "Failed to load identity providers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdps();
  }, [fetchIdps]);

  const handleSaved = (idp: IdPConfig) => {
    setIdps((prev) => {
      const exists = prev.some((p) => p.id === idp.id);
      return exists ? prev.map((p) => (p.id === idp.id ? idp : p)) : [idp, ...prev];
    });
    setView("list");
    setEditingIdp(null);
  };

  const handleDeleted = (id: string) => {
    setIdps((prev) => prev.filter((p) => p.id !== id));
    setView("list");
    setEditingIdp(null);
  };

  const handleEdit = (idp: IdPConfig) => {
    setEditingIdp(idp);
    setView("edit");
  };

  const handleCancel = () => {
    setView("list");
    setEditingIdp(null);
  };

  // -- Form views --
  if (view === "create" || view === "edit") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
            aria-label="Back to list"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h3 className="text-title-md text-of-on-surface font-semibold">
            {view === "create" ? "Add Identity Provider" : "Edit Identity Provider"}
          </h3>
        </div>

        <div className="bg-of-surface-container-low border border-of-outline-variant/20 rounded-xl p-6">
          <IdPConfigForm
            idp={view === "edit" ? editingIdp : null}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  // -- List view --
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-title-md text-of-on-surface font-semibold">
            Identity Providers
          </h3>
          <p className="text-body-sm text-of-on-surface-variant mt-1">
            Configure SAML/OIDC identity providers to enable SSO for your organization.
          </p>
        </div>
        <button
          onClick={() => setView("create")}
          className="flex items-center gap-2 rounded-lg bg-of-primary px-4 py-2 text-label-md font-semibold text-of-on-primary hover:bg-of-primary-fixed transition-all shadow-md shadow-of-primary/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Identity Provider
        </button>
      </div>

      {fetchError && (
        <div className="rounded-xl bg-of-error-container/20 border border-of-error/30 p-4 text-body-sm text-of-error">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-of-primary border-t-transparent rounded-full" />
        </div>
      ) : idps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-of-outline-variant/40 bg-of-surface-container-low p-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-of-primary/10 mb-4">
            <svg
              className="w-6 h-6 text-of-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <p className="text-title-sm text-of-on-surface font-semibold mb-1">
            No identity providers configured
          </p>
          <p className="text-body-sm text-of-on-surface-variant mb-5">
            Add a Google, Okta, Azure AD, or Generic OIDC provider to enable SSO for your team.
          </p>
          <button
            onClick={() => setView("create")}
            className="rounded-lg bg-of-primary px-5 py-2.5 text-label-md font-semibold text-of-on-primary hover:bg-of-primary-fixed transition-all shadow-md shadow-of-primary/20"
          >
            Add Identity Provider
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {idps.map((idp) => (
            <IdPRow key={idp.id} idp={idp} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Info callout */}
      <div className="rounded-xl bg-of-primary/5 border border-of-primary/20 p-4 flex gap-3">
        <svg
          className="w-5 h-5 text-of-primary shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <p className="text-body-sm text-of-on-surface-variant">
          After adding an IdP, users with a matching domain hint can sign in via the SSO flow on the
          login page. The OIDC callback URL to register with your IdP is:{" "}
          <code className="text-of-primary/90 text-label-sm">
            {typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}
            /api/auth/callback
          </code>
        </p>
      </div>
    </div>
  );
}

// -- IdP row sub-component --------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Workspace",
  okta: "Okta",
  azure_ad: "Azure AD / Entra ID",
  generic: "Generic OIDC",
};

function IdPRow({
  idp,
  onEdit,
}: {
  idp: IdPConfig;
  onEdit: (idp: IdPConfig) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-of-outline-variant/20 bg-of-surface-container-low px-5 py-4 hover:border-of-outline-variant/40 transition-colors group">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-of-primary/10 flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-of-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-label-lg text-of-on-surface font-semibold truncate">
            {idp.display_name}
          </p>
          <p className="text-label-sm text-of-on-surface-variant truncate">
            {PROVIDER_LABELS[idp.provider] ?? idp.provider}
            {idp.domain_hint && (
              <span className="ml-2 text-of-on-surface-variant/50">
                &middot; {idp.domain_hint}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {/* Status badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-xs font-medium ${
            idp.active
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-of-surface-container-highest text-of-on-surface-variant/60 border border-of-outline-variant/30"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${idp.active ? "bg-emerald-400" : "bg-of-on-surface-variant/40"}`}
          />
          {idp.active ? "Active" : "Inactive"}
        </span>

        <button
          onClick={() => onEdit(idp)}
          className="rounded-lg border border-of-outline-variant/30 px-3 py-1.5 text-label-sm text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/60 transition-all opacity-0 group-hover:opacity-100"
        >
          Configure
        </button>
      </div>
    </div>
  );
}
