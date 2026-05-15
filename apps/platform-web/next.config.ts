import path from 'node:path';
import type { NextConfig } from "next";

// In a pnpm workspace, Next.js's automatic root detection can pick the wrong
// directory (e.g. src/app) and fail to resolve `next/package.json`. Pin the
// turbopack root to the monorepo root, which is two levels up from this file.
const monorepoRoot = path.resolve(__dirname, '../..');

// V-08 — reverse-proxy the Element Web container that runs under the
// Compose `matrix` profile. The /dashboard/matrix-console page renders
// an iframe pointing at /_matrix/element/, so keeping the proxy on the
// same origin avoids cross-origin iframe + cookie issues.  When
// platform-web runs **outside** Compose (e.g. local `pnpm dev` without
// `--profile matrix`), the upstream is unreachable and the iframe will
// simply fail to load — which is the expected behaviour, the matrix
// profile is opt-in.
const MATRIX_ELEMENT_UPSTREAM =
  process.env['MATRIX_ELEMENT_UPSTREAM'] ?? 'http://element';

// Asset routing collision fix (2026-05-10):
// Both portal and platform-web are Next.js apps and emit static assets at
// /_next/static/*. The pantheon ingress catch-all (/*) sends every /_next/*
// request to portal, so platform-web's chunk hashes 404 → unstyled pages.
// Fix: prefix platform-web's emitted asset URLs with /_pw, and add a matching
// /_pw/* ingress rule that targets platform-web. We do NOT set basePath here
// because that would shift all routes (e.g. /dashboard/os/maker → /_pw/...)
// and break the ingress route carve-outs in apps/platform-api/k8s/pantheon/ingress.yaml.
//
// Because Next.js's standalone server does not actually serve under assetPrefix
// (assetPrefix is the CDN-side prefix; the origin still serves at /_next/*),
// we add a server-side rewrite below that maps incoming /_pw/_next/* requests
// back to /_next/* before Next's internal handler picks them up.
const ASSET_PREFIX = '/_pw';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  assetPrefix: ASSET_PREFIX,
  turbopack: {
    root: monorepoRoot,
  },
  // W-E.3 — enable Next 16's experimental View Transitions integration so
  // `document.startViewTransition` calls from the new `useViewTransition`
  // hook drive RSC navigation animations on supported browsers. CSS-only
  // cross-document transitions are configured separately in `globals.css`
  // (`@view-transition { navigation: auto; }`).
  experimental: {
    viewTransition: true,
  },
  async rewrites() {
    return {
      // beforeFiles runs before Next.js's internal /_next/* static handler,
      // so it's the correct hook for stripping the asset prefix on the way in.
      beforeFiles: [
        {
          source: '/_pw/_next/:path*',
          destination: '/_next/:path*',
        },
        {
          source: '/_pw/static/:path*',
          destination: '/static/:path*',
        },
      ],
      afterFiles: [
        {
          source: '/_matrix/element',
          destination: `${MATRIX_ELEMENT_UPSTREAM}/`,
        },
        {
          source: '/_matrix/element/:path*',
          destination: `${MATRIX_ELEMENT_UPSTREAM}/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
