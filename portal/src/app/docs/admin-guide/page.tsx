import fs from "fs";
import path from "path";
import MarkdownContent from "@/components/docs/MarkdownContent";

export const metadata = {
  title: "Administrator Guide - Tiresias Docs",
  description: "Tiresias deployment, configuration, SIEM integration, monitoring, and troubleshooting.",
};

export default function AdminGuidePage() {
  const filePath = path.join(process.cwd(), "content", "docs", "ADMIN_GUIDE.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return <MarkdownContent content={content} />;
}
