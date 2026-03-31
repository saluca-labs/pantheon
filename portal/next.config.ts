import type { NextConfig } from "next";

const soulAuthApiUrl =
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "http://soulauth.tiresias.svc.cluster.local";

const tiresiasProxyUrl =
  process.env.TIRESIAS_PROXY_URL || "http://tiresias-proxy:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Analytics endpoints → Tiresias proxy (bypasses SoulAuth license gate)
        {
          source: "/v1/analytics/:path*",
          destination: `${tiresiasProxyUrl}/v1/analytics/:path*`,
        },
      ],
      afterFiles: [
        {
          source: "/dash/:path*",
          destination: `${tiresiasProxyUrl}/dash/:path*`,
        },
        {
          source: "/v1/:path*",
          destination: `${soulAuthApiUrl}/v1/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
