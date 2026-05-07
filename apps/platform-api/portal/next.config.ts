import type { NextConfig } from "next";

const soulAuthApiUrl =
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "http://soulauth.tiresias.svc.cluster.local";

const tiresiasProxyUrl =
  process.env.TIRESIAS_PROXY_URL || "http://tiresias-proxy:8080";

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
        // /v1/* handled by catch-all route at /v1/[...path]/route.ts which runs verifySession
        // server-side before forwarding to soulauth with the session token. The old
        // afterFiles rewrite to soulauth is removed because Next.js afterFiles rewrites
        // fire before dynamic routes, so they would otherwise bypass the catch-all and
        // drop the middleware-injected X-SoulKey header.
        // MSSP endpoints served by /api/mssp/* routes directly (no rewrite needed).
        // /v1/support/* is forwarded internally by the catch-all to /api/support/*.
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
