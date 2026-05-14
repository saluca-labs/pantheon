# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and clean stale build cache
COPY . .
RUN rm -rf .next

# Build-time env vars (override at build via --build-arg)
# IMPORTANT: NEXT_PUBLIC_* are inlined by webpack at build time. Setting them
# at runtime (k8s env) is a no-op for client bundles AND for any server-side
# code that reads them via process.env in a statically-analyzable way.
# Defaults below are tiresias-compatible; pantheon builds MUST override.
ARG NEXT_PUBLIC_APP_URL=https://tiresias.network
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth.tiresias.svc.cluster.local
ENV NEXT_PUBLIC_SOULAUTH_API_URL=$NEXT_PUBLIC_SOULAUTH_API_URL
ARG NEXT_PUBLIC_SOULGATE_API_URL=http://soulgate.tiresias.svc.cluster.local
ENV NEXT_PUBLIC_SOULGATE_API_URL=$NEXT_PUBLIC_SOULGATE_API_URL
ARG NEXT_PUBLIC_SOULWATCH_API_URL=http://soulwatch.tiresias.svc.cluster.local
ENV NEXT_PUBLIC_SOULWATCH_API_URL=$NEXT_PUBLIC_SOULWATCH_API_URL
# Deployed git tag (e.g. v0.1.57). Surfaced by /api/health for ops visibility.
# CD passes this via docker/build-push-action build-args from the resolved tag;
# local builds fall back to "unknown". The route runs server-side at request
# time (force-dynamic + runtime=nodejs), so we also re-declare ARG+ENV in the
# runner stage below — ENV from the builder stage does not propagate.
ARG NEXT_PUBLIC_APP_VERSION=unknown
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN npm run build

# ── Stage 2: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Surface the deployed tag at runtime for /api/health. Same value as the
# builder-stage ARG (forwarded by CD via build-args); defaults to "unknown".
ARG NEXT_PUBLIC_APP_VERSION=unknown
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
