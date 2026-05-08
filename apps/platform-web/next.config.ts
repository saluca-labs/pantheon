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

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  async rewrites() {
    return [
      {
        source: '/_matrix/element',
        destination: `${MATRIX_ELEMENT_UPSTREAM}/`,
      },
      {
        source: '/_matrix/element/:path*',
        destination: `${MATRIX_ELEMENT_UPSTREAM}/:path*`,
      },
    ];
  },
};

export default nextConfig;
