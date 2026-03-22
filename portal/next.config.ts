import type { NextConfig } from "next";

const soulAuthApiUrl =
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "https://tiresias.saluca.com";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${soulAuthApiUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
