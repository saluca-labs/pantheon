"use client";

import type { OIDCProvider } from "@/lib/oidc";

// -- Provider icon map ------------------------------------------------------

function ProviderIcon({ provider }: { provider: OIDCProvider }) {
  switch (provider) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      );
    case "okta":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#007DC1" />
          <circle cx="12" cy="12" r="5" fill="white" />
        </svg>
      );
    case "azure_ad":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
          <path d="M11.5 2L2 19h7l2.5-4.5L14 19h8L11.5 2z" fill="#0078D4" />
          <path d="M11.5 2L9 14.5l3 4.5 3-4.5L11.5 2z" fill="#50E6FF" opacity="0.6" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5 text-of-on-surface-variant"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      );
  }
}

// -- Component --------------------------------------------------------------

interface SSOLoginButtonProps {
  provider: OIDCProvider;
  providerName: string;
  tenantSlug: string;
  className?: string;
  disabled?: boolean;
}

export function SSOLoginButton({
  provider,
  providerName,
  tenantSlug,
  className = "",
  disabled = false,
}: SSOLoginButtonProps) {
  const handleClick = () => {
    if (disabled) return;
    window.location.href = `/api/auth/authorize?tenant=${encodeURIComponent(tenantSlug)}`;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-3 w-full rounded-lg border border-of-outline-variant/40 bg-of-surface-container-high px-6 py-3 text-label-lg font-semibold text-of-on-surface hover:bg-of-surface-container-highest hover:border-of-outline-variant/60 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <ProviderIcon provider={provider} />
      <span>Sign in with {providerName}</span>
    </button>
  );
}
