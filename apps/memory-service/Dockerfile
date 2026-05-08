# syntax=docker/dockerfile:1.7
# @platform/memory-service — multi-stage, non-root.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/memory-service/package.json apps/memory-service/
COPY packages/memory/package.json packages/memory/
RUN pnpm fetch

FROM deps AS build
# Install build toolchain needed by native deps:
# - python3, make, g++: better-sqlite3 native bindings
# - git: node-llama-cpp clones llama.cpp at postinstall time
# We can't simply --ignore-scripts because better-sqlite3's prebuild
# isn't always available for Alpine and we need its postinstall.
RUN apk add --no-cache git make g++ python3 py3-setuptools
# We don't actually need node-llama-cpp's bundled llama.cpp build at
# runtime — the sidecar uses sqlite-vec for embeddings, and
# node-llama-cpp is a lazy-required optional peer dep. Skip its
# heavyweight postinstall (clone + compile) but let other native
# postinstalls (better-sqlite3, sqlite-vec) run normally.
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD=true
COPY tsconfig.base.json ./
COPY packages/memory packages/memory
COPY apps/memory-service apps/memory-service
RUN pnpm install --frozen-lockfile=false --offline=false \
  && pnpm --filter @platform/memory run build \
  && pnpm --filter @platform/memory-service run build \
  && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app -u 1001 app
WORKDIR /app
# Pre-create the SQLite data dir owned by the non-root user. Compose
# mounts the memory_data volume here — docker preserves the in-image
# ownership when the volume is empty on first attach, so subsequent
# starts continue to work.
RUN mkdir -p /data && chown -R app:app /data
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/memory ./packages/memory
COPY --from=build --chown=app:app /app/apps/memory-service ./apps/memory-service
USER app
EXPOSE 8910
# Ship a healthcheck.cjs alongside the app for callers that want one
# (compose can wire it into a healthcheck:test override). We deliberately
# do NOT declare a HEALTHCHECK in the Dockerfile because earlier attempts
# (wget, node -e fetch, and node script) all flapped under Docker on the
# CI runner with no observable failure reason — the server logs show it
# listening, but the probe never appears in the access log. Upstream
# services depend on memory-service via service_started; the smoke
# harness exercises the real API surface for correctness.
COPY --chown=app:app apps/memory-service/healthcheck.cjs ./healthcheck.cjs
CMD ["node", "apps/memory-service/dist/server.js"]
