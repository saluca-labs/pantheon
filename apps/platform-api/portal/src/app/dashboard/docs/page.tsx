"use client";

import React from "react";
import Link from "next/link";
import { BookOpen, FileText, Server, Network } from "lucide-react";

/** Document registry — all docs available in the OSS portal. */
export const DOCS_REGISTRY: Array<{
  slug: string;
  title: string;
  description: string;
  file: string;
  icon: React.ReactNode;
}> = [
  {
    slug: "platform-overview",
    title: "Platform Overview",
    description: "Pantheon AI agent security platform overview, features, and capabilities.",
    file: "PLATFORM_OVERVIEW.md",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    slug: "user-guide",
    title: "User & Developer Guide",
    description: "Getting started with Pantheon: authentication, SDK, capability tokens, best practices.",
    file: "USER_GUIDE.md",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "Platform architecture: data flow, detection layers, security properties.",
    file: "ARCHITECTURE.md",
    icon: <Network className="w-5 h-5" />,
  },
  {
    slug: "admin-guide",
    title: "Administrator Guide",
    description: "Deployment, configuration, SIEM integration, database setup, monitoring, and troubleshooting.",
    file: "ADMIN_GUIDE.md",
    icon: <Server className="w-5 h-5" />,
  },
];

export default function DocsIndexPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-of-on-surface">Documentation</h1>
        <p className="text-sm text-of-on-surface-variant mt-1">
          Platform guides and reference documentation for your deployment.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DOCS_REGISTRY.map((doc) => (
          <Link
            key={doc.slug}
            href={`/dashboard/docs/${doc.slug}`}
            className="group flex gap-4 rounded-xl border border-of-outline-variant/10 bg-of-surface-container p-5 hover:border-of-primary/30 hover:bg-of-surface-container-high transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-of-primary/10 border border-of-primary/20 flex items-center justify-center shrink-0 text-of-primary">
              {doc.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-of-on-surface group-hover:text-of-primary transition-colors">
                {doc.title}
              </p>
              <p className="text-xs text-of-on-surface-variant mt-1 line-clamp-2">
                {doc.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
