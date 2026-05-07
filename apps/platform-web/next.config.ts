import path from 'node:path';
import type { NextConfig } from "next";

// In a pnpm workspace, Next.js's automatic root detection can pick the wrong
// directory (e.g. src/app) and fail to resolve `next/package.json`. Pin the
// turbopack root to the monorepo root, which is two levels up from this file.
const monorepoRoot = path.resolve(__dirname, '../..');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
