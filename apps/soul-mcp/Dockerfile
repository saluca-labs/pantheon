# syntax=docker/dockerfile:1.7
# @platform/soul-mcp — dual-surface adapter (MCP-over-stdio + HTTP).
#
# Build context: repo root (matches memory-service's pattern; we COPY
# pnpm-workspace.yaml + the workspace packages into the build).
#
# Image surface:
#   stdio  → MCP harness exec's into the container (kubectl exec or
#            sidecar with shareProcessNamespace) and pipes through.
#   http   → /api/tools/<name> REST surface on port 8090.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/soul-mcp/package.json apps/soul-mcp/
RUN pnpm fetch

FROM deps AS build
# better-sqlite3 needs python/make/g++ for prebuild fallback. Skip
# node-llama-cpp's heavyweight postinstall — we don't use it.
RUN apk add --no-cache make g++ python3 py3-setuptools
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD=true
COPY tsconfig.base.json ./
COPY apps/soul-mcp apps/soul-mcp
RUN pnpm install --frozen-lockfile=false --offline=false \
  && pnpm --filter @platform/soul-mcp run build \
  && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app -u 1001 app
WORKDIR /app
RUN mkdir -p /app/data && chown -R app:app /app/data
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/soul-mcp ./apps/soul-mcp
USER app
EXPOSE 8090
# Default transport is `both` — HTTP for in-cluster callers, stdio for
# any harness that exec's into the container. Override with
# SOUL_MCP_TRANSPORT or `--transport=` flag.
CMD ["node", "apps/soul-mcp/dist/server.js"]
