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
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/memory ./packages/memory
COPY --from=build --chown=app:app /app/apps/memory-service ./apps/memory-service
USER app
EXPOSE 8910
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8910/health/ready || exit 1
CMD ["node", "apps/memory-service/dist/server.js"]
