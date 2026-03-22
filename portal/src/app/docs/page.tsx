import fs from "fs";
import path from "path";
import MarkdownContent from "@/components/docs/MarkdownContent";

export const metadata = {
  title: "Platform Overview - Tiresias Docs",
  description: "Tiresias AI agent security platform overview, features, pricing, and FAQ.",
};

export default function DocsIndexPage() {
  const filePath = path.join(process.cwd(), "content", "docs", "PLATFORM_OVERVIEW.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return <MarkdownContent content={content} />;
}
