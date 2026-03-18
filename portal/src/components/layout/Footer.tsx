"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const footerLinks = {
  Platform: [
    { label: "SoulAuth", href: "/platform/soulauth" },
    { label: "SoulWatch", href: "/platform/soulwatch" },
    { label: "SoulGate", href: "/platform/soulgate" },
    { label: "Pricing", href: "/pricing" },
  ],
  Developers: [
    { label: "Documentation", href: "/developers" },
    { label: "API Reference", href: "/developers#api" },
    { label: "SDK", href: "/developers#sdk" },
    { label: "Status", href: "/security#status" },
  ],
  Company: [
    { label: "About", href: "/company" },
    { label: "Blog", href: "/company#blog" },
    { label: "Security & Trust", href: "/security" },
    { label: "Contact", href: "/company#contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/legal" },
    { label: "Terms of Service", href: "/legal#terms" },
    { label: "DPA", href: "/legal#dpa" },
    { label: "Responsible Disclosure", href: "/security#disclosure" },
  ],
};

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-8 right-8 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-navy-800 border border-border text-foreground-muted hover:text-gold-400 hover:border-gold-500/30 transition-all duration-300 shadow-lg"
      aria-label="Back to top"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  );
}

export default function Footer() {
  return (
    <>
      <footer className="relative bg-navy-950">
        {/* Top gradient border */}
        <div className="h-px bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />

        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-3 mb-4 group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden animate-breathe" style={{ animationDuration: "6s" }}>
                  <img src="/tiresias-icon.png" alt="Tiresias" className="w-full h-full object-cover" />
                </div>
                <span className="text-lg font-semibold">Tiresias</span>
              </div>
              <p className="text-sm text-foreground-muted leading-relaxed">
                Zero-knowledge agent security for the enterprise. We see threats. Never data.
              </p>
            </div>

            {/* Link columns */}
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-foreground mb-4 tracking-wide">{category}</h3>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-foreground-muted hover:text-foreground transition-colors link-underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-foreground-subtle">
              &copy; {new Date().getFullYear()} Saluca LLC. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <span className="text-xs text-foreground-subtle">
                Privacy by architecture, not by policy.
              </span>
            </div>
          </div>
        </div>
      </footer>
      <BackToTop />
    </>
  );
}
