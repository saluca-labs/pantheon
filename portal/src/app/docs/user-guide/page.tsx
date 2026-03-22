import fs from "fs";
import path from "path";
import MarkdownContent from "@/components/docs/MarkdownContent";

export const metadata = {
  title: "User & Developer Guide - Tiresias Docs",
  description: "Getting started with Tiresias: authentication, SDK, capability tokens, best practices.",
};

export default function UserGuidePage() {
  const filePath = path.join(process.cwd(), "content", "docs", "USER_GUIDE.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return <MarkdownContent content={content} />;
}
