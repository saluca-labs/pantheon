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
      beforeFiles: [],
      afterFiles: [
        // SoulAuth health & metrics (DASH-003/004)
        {
          source: "/metrics",
          destination: `${soulAuthApiUrl}/metrics`,
        },
        {
          source: "/health",
          destination: `${soulAuthApiUrl}/health`,
        },
        // /dash/* handled by API route at /api/dash/[...path] which injects API key server-side
        // MSSP endpoints now served by /api/mssp/* routes directly (no rewrite needed)
        {
          // Support tickets handled by local API route, not SoulAuth
          source: "/v1/support/:path*",
          destination: "/api/support/:path*",
        },
        {
          // Analytics + all other /v1/* → SoulAuth (CROSS-002/DASH-009: analytics no longer misrouted to tiresias-proxy)
          source: "/v1/:path*",
          destination: `${soulAuthApiUrl}/v1/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
