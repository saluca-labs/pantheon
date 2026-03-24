import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/api/", "/v1/"],
      },
      {
        // Block known training-only crawlers
        userAgent: "CCBot",
        disallow: ["/"],
      },
      {
        userAgent: "Bytespider",
        disallow: ["/"],
      },
    ],
    sitemap: "https://tiresias.network/sitemap.xml",
  };
}
