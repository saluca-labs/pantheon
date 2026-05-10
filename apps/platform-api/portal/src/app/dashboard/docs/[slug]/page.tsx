import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import DocViewer from "./DocViewer";

/** Minimal registry duplicated server-side for static file resolution. */
const DOCS_MAP: Record<string, { title: string; file: string; minTier: string }> = {
  "platform-overview": { title: "Platform Overview", file: "PLATFORM_OVERVIEW.md", minTier: "community" },
  "user-guide": { title: "User & Developer Guide", file: "USER_GUIDE.md", minTier: "community" },
  "architecture": { title: "Architecture", file: "ARCHITECTURE.md", minTier: "enterprise" },
  "admin-guide": { title: "Administrator Guide", file: "ADMIN_GUIDE.md", minTier: "enterprise" },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const doc = DOCS_MAP[slug];
  if (!doc) return { title: "Not Found" };
  return {
    title: `${doc.title} - Pantheon Docs`,
    description: `Tiresias documentation: ${doc.title}`,
  };
}

export default async function DocSlugPage({ params }: Props) {
  const { slug } = await params;
  const doc = DOCS_MAP[slug];

  if (!doc) {
    notFound();
  }

  const filePath = path.join(process.cwd(), "content", "docs", doc.file);
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    notFound();
  }

  return (
    <DocViewer
      content={content}
      title={doc.title}
      minTier={doc.minTier}
      slug={slug}
    />
  );
}
