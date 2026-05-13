# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/auth/package.json ./packages/auth/
COPY packages/blob-store/package.json ./packages/blob-store/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/memory/package.json ./packages/memory/
COPY packages/observability/package.json ./packages/observability/
COPY apps/platform-web/package.json ./apps/platform-web/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# Copy full source first, then install — pnpm needs every workspace
# package.json present to materialize per-package node_modules and .bin
# symlinks correctly. (The earlier COPY-from-deps approach lost those
# nested symlinks when `COPY . .` overlaid the packages/ and apps/ dirs.)
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Build shared workspace packages first — platform-web imports @platform/auth,
# @platform/config, @platform/types, all of which point at dist/ entry points
# ("main": "dist/index.js"). Without this, Turbopack can't resolve them.
RUN pnpm --filter "@platform/types" \
         --filter "@platform/config" \
         --filter "@platform/auth" \
         --filter "@platform/blob-store" \
         run build
RUN pnpm --filter platform-web build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/platform-web/.next/standalone ./
COPY --from=builder /repo/apps/platform-web/.next/static ./apps/platform-web/.next/static
COPY --from=builder /repo/apps/platform-web/public ./apps/platform-web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["node", "apps/platform-web/server.js"]
