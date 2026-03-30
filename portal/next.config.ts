import type { NextConfig } from "next";

const soulAuthApiUrl =
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "http://soulauth.tiresias.svc.cluster.local";

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
