"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";

const navigation = [
  {
    label: "Platform",
    href: "/platform",
    children: [
      { label: "SoulAuth", href: "/platform/soulauth", badge: "GA" },
      { label: "SoulWatch", href: "/platform/soulwatch", badge: "New" },
      { label: "SoulGate", href: "/platform/soulgate", badge: "New" },
    ],
  },
  { label: "Use Cases", href: "/use-cases" },
  { label: "Pricing", href: "/pricing" },
  { label: "Developers", href: "/developers" },
  { label: "Company", href: "/company" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { session, logout } = useAuth();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300"
        style={{
          borderColor: scrolled ? "var(--border)" : "transparent",
          background: scrolled
            ? "rgba(10, 14, 26, 0.9)"
            : "rgba(10, 14, 26, 0.4)",
          backdropFilter: scrolled ? "blur(20px)" : "blur(8px)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden transition-transform duration-300 group-hover:scale-110">
                <img src="/tiresias-icon.png" alt="Tiresias" className="w-full h-full object-cover" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Tiresias</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden lg:flex lg:items-center lg:gap-1">
              {navigation.map((item) =>
                item.children ? (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => setPlatformOpen(true)}
                    onMouseLeave={() => setPlatformOpen(false)}
                  >
                    <button
                      className={`relative px-4 py-2 text-sm transition-colors ${
                        isActive(item.href) ? "text-foreground" : "text-of-on-surface-variant hover:text-foreground"
                      }`}
                    >
                      {item.label}
                      <svg
                        className={`ml-1 inline h-3 w-3 transition-transform duration-200 ${platformOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {isActive(item.href) && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute bottom-0 left-4 right-4 h-0.5 bg-of-primary rounded-full"
                        />
                      )}
                    </button>
                    <AnimatePresence>
                      {platformOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute left-0 top-full pt-2"
                        >
                          <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-2 min-w-[220px] shadow-2xl">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="flex items-center justify-between rounded-lg px-4 py-3 text-sm text-of-on-surface-variant hover:text-foreground hover:bg-of-surface-container/50 transition-colors"
                              >
                                {child.label}
                                {child.badge && (
                                  <span
                                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                      child.badge === "GA"
                                        ? "bg-of-primary/20 text-of-primary"
                                        : child.badge === "New"
                                          ? "bg-of-primary/15 text-of-primary"
                                          : "bg-of-surface-container text-of-outline"
                                    }`}
                                  >
                                    {child.badge}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`relative px-4 py-2 text-sm transition-colors ${
                      isActive(item.href) ? "text-foreground" : "text-of-on-surface-variant hover:text-foreground"
                    }`}
                  >
                    {item.label}
                    {isActive(item.href) && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute bottom-0 left-4 right-4 h-0.5 bg-of-primary rounded-full"
                      />
                    )}
                  </Link>
                )
              )}
            </div>

            {/* CTA buttons */}
            <div className="hidden lg:flex lg:items-center lg:gap-3">
              {session ? (
                <>
                  <Link
                    href="/dashboard"
                    className="px-4 py-2 text-sm text-of-on-surface-variant hover:text-foreground transition-colors"
                  >
                    Dashboard
                  </Link>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-of-surface-container/50 border border-of-outline-variant/15">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span className="text-xs text-of-on-surface-variant font-mono">
                      {session.tenant_name || session.tenant_id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-of-outline px-1.5 py-0.5 rounded bg-of-surface-container">
                      {session.tier}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm text-of-outline hover:text-red-400 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-4 py-2 text-sm text-of-on-surface-variant hover:text-foreground transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/trial"
                    className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-5 py-2 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
                  >
                    Start Free Trial
                  </Link>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 text-of-on-surface-variant"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-in menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-of-background/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[85vw] bg-of-background/95 backdrop-blur-xl border-l border-of-outline-variant/15 lg:hidden"
            >
              <div className="flex justify-end p-4">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 text-of-on-surface-variant hover:text-foreground"
                  aria-label="Close menu"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 space-y-1">
                {navigation.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05 }}
                  >
                    <Link
                      href={item.href}
                      className={`block px-4 py-3 text-sm rounded-lg transition-colors ${
                        isActive(item.href) ? "text-foreground bg-of-surface-container/50" : "text-of-on-surface-variant hover:text-foreground"
                      }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                    {item.children?.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block pl-8 py-2 text-sm text-of-outline hover:text-foreground transition-colors"
                        onClick={() => setMobileOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </motion.div>
                ))}
                <div className="pt-6 space-y-3">
                  {session ? (
                    <>
                      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-of-surface-container/50 border border-of-outline-variant/15">
                        <span className="h-2 w-2 rounded-full bg-green-400" />
                        <span className="text-xs text-of-on-surface-variant font-mono">
                          {session.tenant_name || session.tenant_id.slice(0, 8)}
                        </span>
                      </div>
                      <Link
                        href="/dashboard"
                        className="block w-full text-center rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-5 py-3 text-sm font-medium text-of-background"
                        onClick={() => setMobileOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <button
                        onClick={() => { setMobileOpen(false); logout(); }}
                        className="block w-full text-center rounded-lg border border-of-outline-variant/15 px-5 py-3 text-sm text-of-outline hover:text-red-400 transition-colors"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="block w-full text-center rounded-lg border border-of-outline-variant/15 px-5 py-3 text-sm font-medium text-of-on-surface-variant"
                        onClick={() => setMobileOpen(false)}
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/trial"
                        className="block w-full text-center rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-5 py-3 text-sm font-medium text-of-background"
                        onClick={() => setMobileOpen(false)}
                      >
                        Start Free Trial
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
