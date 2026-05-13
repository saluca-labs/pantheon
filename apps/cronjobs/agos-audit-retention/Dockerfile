# syntax=docker/dockerfile:1.7
# @pantheon-cronjobs/agos-audit-retention — multi-stage Node 22 alpine, non-root.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/cronjobs/agos-audit-retention/package.json apps/cronjobs/agos-audit-retention/
# Bring in any workspace package metadata the resolver might walk. Add new
# entries here when another cronjob is added.
RUN pnpm fetch --filter @pantheon-cronjobs/agos-audit-retention || pnpm fetch

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/cronjobs/agos-audit-retention apps/cronjobs/agos-audit-retention
RUN pnpm install --frozen-lockfile=false --offline=false \
 && pnpm --filter @pantheon-cronjobs/agos-audit-retention run build \
 && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app -u 1001 app
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/cronjobs/agos-audit-retention ./apps/cronjobs/agos-audit-retention
USER app
CMD ["node", "apps/cronjobs/agos-audit-retention/dist/index.js"]
