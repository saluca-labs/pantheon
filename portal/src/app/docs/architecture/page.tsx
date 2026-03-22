import fs from "fs";
import path from "path";
import MarkdownContent from "@/components/docs/MarkdownContent";

export const metadata = {
  title: "Architecture - Tiresias Docs",
  description: "Tiresias platform architecture: data flow, detection layers, security properties.",
};

export default function ArchitecturePage() {
  const filePath = path.join(process.cwd(), "content", "docs", "ARCHITECTURE.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return <MarkdownContent content={content} />;
}
