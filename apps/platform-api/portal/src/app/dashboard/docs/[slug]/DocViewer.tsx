"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MarkdownContent from "@/components/docs/MarkdownContent";

interface DocViewerProps {
  content: string;
  title: string;
  slug: string;
}

export default function DocViewer({ content, title, slug }: DocViewerProps) {
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

      <MarkdownContent content={content} />
    </div>
  );
}
