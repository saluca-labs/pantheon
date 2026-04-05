"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const docsNav = [
  {
    section: "Overview",
    items: [
      { title: "Platform Overview", href: "/docs" },
      { title: "Architecture", href: "/docs/architecture" },
    ],
  },
  {
    section: "Guides",
    items: [
      { title: "User & Developer Guide", href: "/docs/user-guide" },
      { title: "Administrator Guide", href: "/docs/admin-guide" },
      { title: "Troubleshooting", href: "/docs/troubleshooting" },
    ],
  },
  {
    section: "Products",
    items: [
      { title: "SoulAuth", href: "/platform/soulauth" },
      { title: "SoulWatch", href: "/platform/soulwatch" },
      { title: "SoulGate", href: "/platform/soulgate" },
    ],
  },
  {
    section: "Resources",
    items: [
      { title: "API Reference", href: "/developers" },
      { title: "Pricing", href: "/pricing" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-16">
        <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8 py-8 lg:py-12">
            {/* Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              <nav className="sticky top-24 space-y-6 pr-4 border-r border-border max-h-[calc(100vh-8rem)] overflow-y-auto">
                {docsNav.map((group) => (
                  <div key={group.section}>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle mb-2 px-3">
                      {group.section}
                    </h4>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                                active
                                  ? "bg-gold-500/10 text-gold-400 font-medium"
                                  : "text-foreground-muted hover:text-foreground hover:bg-navy-800/50"
                              }`}
                            >
                              {item.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </aside>

            {/* Main content */}
            <main className="min-w-0 flex-1 max-w-4xl">
              {children}
            </main>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
