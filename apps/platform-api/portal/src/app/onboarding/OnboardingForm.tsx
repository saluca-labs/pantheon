"use client";

import { useState, FormEvent } from "react";
import { config } from "@/lib/config";

/** Partner onboarding application — standalone, unlisted page. */

const TOS_TEXT = `TIRESIAS PARTNER PROGRAM TERMS AND CONDITIONS

Effective Date: Upon submission of this application.

1. PARTNER RELATIONSHIP
By submitting this application, you ("Partner") are applying to join the Tiresias Partner Program operated by Saluca LLC ("Company"). Acceptance into the program is at the sole discretion of the Company. This agreement governs the terms of your participation upon approval.

2. SCOPE OF PARTNERSHIP
Partners are granted access to the Tiresias platform for the purposes of evaluation, integration, and resale of Tiresias security services (SoulAuth, SoulWatch, SoulGate) to their clients. Partners may not sublicense, reverse engineer, or redistribute platform components outside the scope of this agreement.

3. CONFIDENTIALITY
Partner agrees to maintain strict confidentiality of all proprietary information, including but not limited to: API credentials, soulkeys, platform architecture, pricing structures, roadmap details, and client data. Disclosure of confidential information to unauthorized third parties constitutes grounds for immediate termination.

4. DATA HANDLING AND PRIVACY
Partner acknowledges that Tiresias processes security telemetry and agent identity data. Partner agrees to handle all data in accordance with applicable data protection regulations including GDPR and CCPA where applicable. Partner shall not attempt to extract, correlate, or deanonymize data belonging to other tenants on the platform.

5. COMMISSION AND COMPENSATION
Commission rates, payout schedules, and revenue sharing terms will be established upon approval and documented in your partner dashboard. The Company reserves the right to modify commission structures with 30 days written notice. All payouts are processed through Stripe Connect.

6. INTELLECTUAL PROPERTY
All intellectual property rights in the Tiresias platform, including trademarks, patents, copyrights, and trade secrets, remain the exclusive property of Saluca LLC. Partner is granted a limited, non-exclusive, revocable license to use Tiresias trademarks solely for the purpose of promoting and reselling the platform.

7. TERM AND TERMINATION
This agreement remains in effect until terminated by either party with 30 days written notice. The Company may terminate immediately for cause, including breach of confidentiality, misuse of credentials, or conduct detrimental to the Company's reputation. Upon termination, Partner must cease all use of platform credentials and destroy confidential materials.

8. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Saluca LLC's total liability under this agreement shall not exceed the total commissions paid to Partner in the 12 months preceding any claim. In no event shall either party be liable for indirect, incidental, or consequential damages.

9. REPRESENTATIONS
By submitting this application, you represent that: (a) you have the authority to enter into this agreement; (b) the information provided is accurate and complete; (c) you will comply with all applicable laws and regulations in your use of the platform.

10. GOVERNING LAW
This agreement is governed by the laws of the State of Arizona, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration in Maricopa County, Arizona.

11. CONSENT
Submission of this application, including your email address and LinkedIn profile, constitutes your acknowledgment that you have read, understood, and agree to be bound by these terms and conditions. Your personal information will be used solely for the purpose of evaluating and managing your partnership application.`;

export default function OnboardingForm() {
  const [formData, setFormData] = useState({
    email: "",
    linkedin_url: "",
  });
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosExpanded, setTosExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || !tosAccepted) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${config.apiUrl}/v1/partner/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          linkedin_url: formData.linkedin_url,
          tos_accepted: true,
        }),
      });

      if (res.status === 409) {
        throw new Error("An application with this email is already on file. We'll be in touch.");
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
        startCooldown(retryAfter);
        throw new Error(`Too many attempts. Please wait ${retryAfter} seconds.`);
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || `Something went wrong (${res.status})`);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      {/* Subtle radial glow */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,168,83,0.04),transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold tracking-wide text-gradient-gold">TIRESIAS</h1>
          <p className="text-xs text-foreground-subtle tracking-[0.2em] mt-1">PARTNER PROGRAM</p>
        </div>

        {success ? (
          <div className="glass-card rounded-2xl p-8 sm:p-10 glow-gold">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">Application received</h2>
            </div>
            <p className="text-foreground-muted text-sm leading-relaxed mb-4">
              Your application has been submitted for review. We review each application personally
              and will be in touch at <span className="text-foreground font-medium">{formData.email}</span>.
            </p>
            <p className="text-xs text-foreground-subtle">
              Typical review time is 1 to 3 business days.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 sm:p-10">
            <h2 className="text-xl font-bold mb-1">Partner Application</h2>
            <p className="text-sm text-foreground-muted mb-8">
              Apply to join the Tiresias partner program. All applications are reviewed personally.
            </p>

            {error && (
              <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground-muted mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                />
              </div>

              {/* LinkedIn */}
              <div>
                <label htmlFor="linkedin_url" className="block text-sm font-medium text-foreground-muted mb-2">
                  LinkedIn profile
                </label>
                <input
                  id="linkedin_url"
                  name="linkedin_url"
                  type="url"
                  required
                  value={formData.linkedin_url}
                  onChange={handleChange}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                />
              </div>

              {/* ToS */}
              <div className="rounded-xl border border-border bg-navy-950/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTosExpanded(!tosExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  <span className="font-medium">Terms and Conditions</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${tosExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {tosExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    <pre className="mt-3 text-xs text-foreground-subtle leading-relaxed whitespace-pre-wrap font-sans max-h-64 overflow-y-auto pr-2">
                      {TOS_TEXT}
                    </pre>
                  </div>
                )}

                <div className="px-4 pb-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={tosAccepted}
                      onChange={(e) => setTosAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border bg-navy-950 text-gold-500 focus:ring-gold-500/20 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-foreground-subtle leading-relaxed group-hover:text-foreground-muted transition-colors">
                      I have read and agree to the Terms and Conditions. I understand that submitting
                      my email address and LinkedIn profile constitutes consent and acknowledgment of
                      having read the full terms above.
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || cooldown > 0 || !tosAccepted}
                className="w-full rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? (
                  `Please wait ${cooldown}s...`
                ) : isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "Submit Application"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-foreground-subtle mt-8">
          Tiresias by Saluca Labs
        </p>
      </div>
    </main>
  );
}
