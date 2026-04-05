import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Platform portal has no public pages to index.
  // All routes are behind authentication.
  return [];
}
