import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    ppr: false,
  },
  turbopack: {
    root: ".",
  },
  async headers() {
    return [
      {
        source: "/trial",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/pricing",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
