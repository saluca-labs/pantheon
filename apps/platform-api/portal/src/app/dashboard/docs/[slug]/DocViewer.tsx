"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { TierGate, tierMeets, type Tier } from "@/components/dashboard/TierGate";
import MarkdownContent from "@/components/docs/MarkdownContent";

interface DocViewerProps {
  content: string;
  title: string;
  minTier: string;
  slug: string;
}

export default function DocViewer({ content, title, minTier, slug }: DocViewerProps) {
  const { session } = useAuth();
  const currentTier = session?.tier ?? "community";
  const hasAccess = tierMeets(currentTier, minTier as Tier);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/docs"
          className="flex items-center gap-1 text-xs text-of-on-surface-variant hover:text-of-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Docs
        </Link>
        <span className="text-xs text-of-outline-variant">/</span>
        <span className="text-xs text-of-on-surface font-medium">{title}</span>
      </div>

      {hasAccess ? (
        <MarkdownContent content={content} />
      ) : (
        <TierGate requiredTier={minTier as Tier} featureLabel={title}>
          {/* children never rendered when tier is insufficient */}
          <div />
        </TierGate>
      )}
    </div>
  );
}
