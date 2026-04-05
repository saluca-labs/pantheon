import fs from "fs";
import path from "path";
import MarkdownContent from "@/components/docs/MarkdownContent";

export const metadata = {
  title: "Troubleshooting - Tiresias Docs",
  description: "Common issues and solutions for Tiresias SaaS proxy customers.",
};

export default function TroubleshootingPage() {
  const filePath = path.join(process.cwd(), "content", "docs", "TROUBLESHOOTING.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return <MarkdownContent content={content} />;
}
