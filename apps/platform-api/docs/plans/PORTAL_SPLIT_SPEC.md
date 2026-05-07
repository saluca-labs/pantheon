# Portal Split Spec: Marketing Site + Platform Dashboard

## 1. Executive Summary

The Tiresias portal currently serves both public marketing pages and the authenticated platform dashboard from a single Next.js deployment at `tiresias.network`. This spec defines the plan to split it into two deployments: a marketing site at `tiresias.network` (public pages, SEO, trial signup, docs) and a platform dashboard at `platform.tiresias.network` (authenticated dashboard, API routes, billing management). The split improves security posture (smaller attack surface per deployment), enables independent release cycles, and lets the marketing site be served from a CDN edge while the platform stays close to backend services in GKE. The migration is phased over 2-3 days with zero downtime.

---

## 2. Architecture

### Before (current)

```
                          tiresias.network
                                |
                        [ GKE Ingress ]
                                |
               +----------------+----------------+
               |                |                |
          /gate/*          /watch/*          /* (catch-all)
          SoulGate         SoulWatch         Portal (Next.js)
                                              - Landing page
                                              - /platform/*
                                              - /pricing, /docs, /company...
                                              - /login, /trial
                                              - /dashboard/* (authenticated)
                                              - /api/* (billing, auth, session)
                                              - /billing, /checkout
```

### After (target)

```
     tiresias.network                    platform.tiresias.network
           |                                       |
   [ Cloudflare CDN ]                      [ GKE Ingress ]
           |                                       |
   marketing-portal (Next.js)        +-------------+-------------+
     - Landing page                  |             |             |
     - /platform/*                /gate/*      /watch/*      /* (catch-all)
     - /pricing                  SoulGate     SoulWatch     portal (Next.js)
     - /docs, /developers                                    - /dashboard/*
     - /company, /security                                   - /api/*
     - /use-cases, /legal                                    - /login
     - /trial (signup form)                                  - /billing, /checkout
     - /login -> redirect to                                 - /trial/onboarding
       platform.tiresias.network                             - /trial/verify
                                                             - /forgot-password
                                                             - /reset-password

   Shared: .tiresias.network cookie domain for cross-domain auth
```

---

## 3. Page Classification Table

| Route | Classification | Notes |
|---|---|---|
| `/` (landing) | Marketing | Hero, features, CTAs |
| `/platform` | Marketing | Product overview page |
| `/platform/soulauth` | Marketing | Product detail page |
| `/platform/soulwatch` | Marketing | Product detail page |
| `/platform/soulgate` | Marketing | Product detail page |
| `/pricing` | Marketing | Tier comparison, links to checkout on platform |
| `/use-cases` | Marketing | Industry use cases |
| `/developers` | Marketing | SDK/API docs overview |
| `/docs` | Marketing | Documentation hub |
| `/docs/admin-guide` | Marketing | Static docs |
| `/docs/architecture` | Marketing | Static docs |
| `/docs/user-guide` | Marketing | Static docs |
| `/docs/troubleshooting` | Marketing | Static docs |
| `/company` | Marketing | About page |
| `/security` | Marketing | Trust center |
| `/legal` | Marketing | Privacy, ToS, DPA |
| `/trial` | Marketing | Trial signup form (POST goes to platform API) |
| `/login` | **Both** | Marketing has stub that redirects to `platform.tiresias.network/login` |
| `/trial/onboarding` | Platform | Post-signup onboarding (authenticated) |
| `/trial/verify` | Platform | Email verification |
| `/forgot-password` | Platform | Password reset initiation |
| `/reset-password` | Platform | Password reset completion |
| `/billing` | Platform | Billing management (authenticated) |
| `/billing/success` | Platform | Post-payment confirmation |
| `/checkout/success` | Platform | Stripe checkout success |
| `/dashboard/**` | Platform | All dashboard routes (40+ pages) |
| `/api/auth/**` | Platform | Login, callback, authorize, SSO |
| `/api/session/**` | Platform | Session management |
| `/api/billing/**` | Platform | Stripe checkout, webhook, portal |
| `/api/dash/**` | Platform | Dashboard data proxy |
| `/api/soulauth/**` | Platform | SoulAuth data proxy |
| `/api/soulgate/**` | Platform | SoulGate data proxy |
| `/api/soulwatch/**` | Platform | SoulWatch data proxy |
| `/api/mssp/**` | Platform | MSSP management |
| `/api/support/**` | Platform | Support tickets |
| `/api/teams/**` | Platform | Team management |
| `/api/users/**` | Platform | User management |
| `/api/partner/**` | Platform | Partner management |
| `/api/contracts/**` | Platform | Contract management |
| `/api/downloads/**` | Platform | Compose/env downloads |
| `/api/investigation/**` | Platform | Investigation proxy |
| `/api/playground/**` | Platform | Playground execution |
| `/api/invites` | Platform | Invite management |
| `/api/tiresias/**` | Platform | Policy deploy keys |
| `/api/saas/**` | Platform | SaaS admin |
| `/api/watch/**` | Platform | Watch proxy |
| `/sitemap.xml` | Marketing | SEO sitemap |
| `/robots.txt` | Marketing | Crawler rules |
| `/structured-data` | Marketing | JSON-LD schema |

---

## 4. Phase 0: Pre-work (Zero Risk, Deploy Now)

These changes ship to the existing monolith before any split happens. They fix existing bugs and prepare cookie infrastructure.

### 4a. Fix /platform layout auth gate bug

**File:** `portal/src/app/platform/layout.tsx`

The `/platform` layout currently wraps all `/platform/*` routes with an auth check, but `/platform`, `/platform/soulauth`, `/platform/soulwatch`, and `/platform/soulgate` are **marketing pages** that should be publicly accessible. The auth gate causes unauthenticated visitors to be redirected to `/login`, which is wrong.

**Fix:** Remove the auth gate entirely from the `/platform` layout. These are public product pages. The dashboard layout (`/dashboard/layout.tsx`) already handles auth for the dashboard.

```tsx
// portal/src/app/platform/layout.tsx -- REPLACE ENTIRE FILE
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

### 4b. Add COOKIE_DOMAIN env var support to all cookie-setting routes

Currently, cookies are set without an explicit `domain`, which defaults to the exact hostname. For cross-domain auth (`tiresias.network` <-> `platform.tiresias.network`), cookies must be set with `domain=.tiresias.network`.

**Environment variable:** `COOKIE_DOMAIN` (optional, unset = current behavior)

**Files to modify (4 total):**

1. **`portal/src/app/api/session/route.ts`** -- SoulKey + OIDC session creation/deletion
2. **`portal/src/app/api/auth/login/route.ts`** -- Local/LDAP login
3. **`portal/src/app/api/auth/callback/route.ts`** -- OIDC callback

Add to each file:

```typescript
function getCookieDomain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined; // e.g. ".tiresias.network"
}
```

Then add `domain: getCookieDomain()` to every `response.cookies.set()` call. Example for `api/auth/login/route.ts`:

```typescript
response.cookies.set(OIDC_SESSION_COOKIE, session_token, {
  httpOnly: true,
  secure: isSecure,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL,
  domain: getCookieDomain(),  // ADD THIS
});
```

**All 4 cookie names that need domain added:**
- `tiresias_oidc_session` (HttpOnly)
- `tiresias_oidc_data` (readable)
- `tiresias_session` (readable, login route only)
- `tiresias_tenant` (readable)
- `tiresias_session_data` (readable, session route only -- SoulKey flow)

### 4c. Fix sameSite inconsistency

**Current state:**
- `api/auth/login/route.ts` -- all cookies use `sameSite: "lax"` (correct)
- `api/auth/callback/route.ts` -- all cookies use `sameSite: "lax"` (correct)
- `api/session/route.ts` -- SoulKey cookies use `sameSite: "strict"` (WRONG for cross-domain)

**Fix:** Change `sameSite: "strict"` to `sameSite: "lax"` in `api/session/route.ts` for the SoulKey path (lines 99, 116, 124) and the DELETE handler (line 153). `lax` is required for cross-domain cookie sharing and for OAuth redirects to work. The OIDC path in this file already uses `lax`.

**Exact changes in `portal/src/app/api/session/route.ts`:**

```diff
 // POST handler, SoulKey path:
-    sameSite: "strict",
+    sameSite: "lax",

 // DELETE handler:
-    sameSite: "strict",
+    sameSite: "lax",
```

Apply to all 3 occurrences of `"strict"` in the file (lines 101, 119, 153).

---

## 5. Phase 1: Create Marketing Site (Parallel, No Prod Impact)

Build the marketing-portal as a separate Next.js project. This is done in a new directory (or new repo) and deployed independently.

### 5a. Project setup

```bash
# In the tiresias repo root or a new repo:
mkdir marketing-portal && cd marketing-portal
npx create-next-app@latest . --typescript --tailwind --app --src-dir
```

### 5b. Files to copy from portal

**Pages (copy and adapt):**

| Source | Destination | Changes needed |
|---|---|---|
| `portal/src/app/page.tsx` | `marketing-portal/src/app/page.tsx` | Keep as-is |
| `portal/src/app/platform/` (all) | `marketing-portal/src/app/platform/` | Remove auth gate from layout |
| `portal/src/app/pricing/page.tsx` | `marketing-portal/src/app/pricing/page.tsx` | Change CTA links to `https://platform.tiresias.network/checkout/...` |
| `portal/src/app/use-cases/page.tsx` | `marketing-portal/src/app/use-cases/page.tsx` | Keep as-is |
| `portal/src/app/developers/page.tsx` | `marketing-portal/src/app/developers/page.tsx` | Keep as-is |
| `portal/src/app/docs/` (all) | `marketing-portal/src/app/docs/` | Keep as-is |
| `portal/src/app/company/page.tsx` | `marketing-portal/src/app/company/page.tsx` | Keep as-is |
| `portal/src/app/security/page.tsx` | `marketing-portal/src/app/security/page.tsx` | Keep as-is |
| `portal/src/app/legal/page.tsx` | `marketing-portal/src/app/legal/page.tsx` | Keep as-is |
| `portal/src/app/trial/page.tsx` | `marketing-portal/src/app/trial/page.tsx` | Form POST to `https://platform.tiresias.network/api/...` |
| `portal/src/app/sitemap.ts` | `marketing-portal/src/app/sitemap.ts` | Keep as-is (base URL stays `tiresias.network`) |
| `portal/src/app/robots.ts` | `marketing-portal/src/app/robots.ts` | Remove `/dashboard/` disallow (not served here) |
| `portal/src/app/structured-data.tsx` | `marketing-portal/src/app/structured-data.tsx` | Keep as-is |

**Components to copy:**

| Source | Destination |
|---|---|
| `portal/src/components/layout/Navbar.tsx` | `marketing-portal/src/components/layout/Navbar.tsx` |
| `portal/src/components/layout/Footer.tsx` | `marketing-portal/src/components/layout/Footer.tsx` |
| `portal/src/components/docs/MarkdownContent.tsx` | `marketing-portal/src/components/docs/MarkdownContent.tsx` |

**Lib files to copy (minimal subset):**

| Source | Destination | Changes |
|---|---|---|
| `portal/src/lib/config.ts` | `marketing-portal/src/lib/config.ts` | Strip backend URLs |
| `portal/src/lib/branding.ts` | `marketing-portal/src/lib/branding.ts` | Keep as-is |

**Static assets:**
- Copy entire `portal/public/` directory

**Content:**
- Copy entire `portal/content/` directory (blog posts, docs markdown)

### 5c. Navbar changes for marketing site

Modify `Navbar.tsx` for the marketing site:

```typescript
// Replace the auth-conditional CTA section:
// REMOVE: session check, Dashboard link, tenant badge, Logout button
// REPLACE WITH:
<Link href="https://platform.tiresias.network/login" className="...">
  Sign In
</Link>
<Link href="/trial" className="...">
  Start Free Trial
</Link>
```

Remove `useAuth()` import entirely -- the marketing site does not import the auth provider.

### 5d. Login redirect stub

Create a simple redirect page at `marketing-portal/src/app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function LoginRedirect() {
  redirect("https://platform.tiresias.network/login");
}
```

### 5e. Environment variables

**marketing-portal `.env.production`:**

```bash
NEXT_PUBLIC_APP_URL=https://tiresias.network
NEXT_PUBLIC_PLATFORM_URL=https://platform.tiresias.network
# No SOULAUTH_INTERNAL_URL needed -- no backend calls
# No STRIPE_* keys needed -- billing is on platform
```

### 5f. Dockerfile for marketing-portal

Copy `portal/Dockerfile` as-is. The marketing site is the same Next.js standalone output pattern. Remove SOULAUTH build arg since it's not needed.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN rm -rf .next
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

---

## 6. Phase 2: DNS + TLS

### 6a. Cloudflare DNS records

In the Cloudflare dashboard for `tiresias.network`:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | (existing -- GKE IP) | Proxied | Auto |
| A | `platform` | `<tiresias-ip static IP>` | DNS only | Auto |

> **Note:** `platform.tiresias.network` must be **DNS only** (grey cloud) so GKE Ingress handles TLS via ManagedCertificate. If you want Cloudflare proxy on platform too, use Full (Strict) SSL mode and an origin certificate instead.

**Alternative (Cloudflare edge for marketing):** If moving marketing to Cloudflare Pages or Vercel:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| CNAME | `@` | `<vercel/pages domain>` | Proxied | Auto |
| A | `platform` | `<tiresias-ip>` | DNS only | Auto |

### 6b. GKE ManagedCertificate

Add a new certificate for `platform.tiresias.network`:

```yaml
# k8s/ingress.yaml -- ADD this block
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: tiresias-platform-cert
  namespace: tiresias
  labels:
    app.kubernetes.io/part-of: tiresias
spec:
  domains:
    - platform.tiresias.network
```

### 6c. Update Ingress annotations

Update the managed-certificates annotation to include the new cert:

```yaml
# k8s/ingress.yaml -- MODIFY annotation
annotations:
  networking.gke.io/managed-certificates: "tiresias-cert,tiresias-proxy-cert,tiresias-platform-cert"
```

### 6d. Reserve a static IP (if needed)

If `platform.tiresias.network` shares the same GKE ingress as `tiresias.network`, it uses the same `tiresias-ip` static IP. No new IP needed -- just add a new `host` rule (see Phase 4).

---

## 7. Phase 3: Enable Cross-Domain Cookies (One Env Var)

Once DNS is ready, enable cross-domain cookies by setting one env var on the **platform** deployment:

```yaml
# k8s/portal-deployment.yaml -- ADD to env section
- name: COOKIE_DOMAIN
  value: ".tiresias.network"
```

**What this does:**
- All cookies (`tiresias_oidc_session`, `tiresias_oidc_data`, `tiresias_session`, `tiresias_tenant`, `tiresias_session_data`) are now set with `domain=.tiresias.network`
- This means cookies are readable on both `tiresias.network` and `platform.tiresias.network`
- The marketing site can show "Welcome back" or "Dashboard" link if a session cookie exists

**When to set this:** After Phase 0 code is deployed (COOKIE_DOMAIN support in cookie routes). Before Phase 4.

**Verification:**
1. Log in at `platform.tiresias.network/login`
2. Open devtools on `tiresias.network` -- confirm cookies are visible
3. Confirm dashboard is still functional

---

## 8. Phase 4: Deploy Marketing Site + Update Routing

### 8a. Build and push marketing-portal image

```bash
cd marketing-portal
docker build -t us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing-portal:v1.0.0 .
docker push us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing-portal:v1.0.0
```

### 8b. GKE Deployment for marketing-portal

```yaml
# k8s/marketing-portal-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketing-portal
  namespace: tiresias
  labels:
    app: marketing-portal
    app.kubernetes.io/name: marketing-portal
    app.kubernetes.io/part-of: tiresias
    app.kubernetes.io/component: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: marketing-portal
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: marketing-portal
        app.kubernetes.io/name: marketing-portal
        app.kubernetes.io/part-of: tiresias
    spec:
      serviceAccountName: tiresias-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: marketing-portal
          image: us-central1-docker.pkg.dev/salucainfrastructure/tiresias/marketing-portal:v1.0.0
          ports:
            - containerPort: 3000
              name: http
              protocol: TCP
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: nextjs-cache
              mountPath: /app/.next/cache
          env:
            - name: NEXT_PUBLIC_APP_URL
              value: "https://tiresias.network"
            - name: NEXT_PUBLIC_PLATFORM_URL
              value: "https://platform.tiresias.network"
            - name: NODE_ENV
              value: "production"
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          startupProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 12
      volumes:
        - name: tmp
          emptyDir:
            medium: Memory
            sizeLimit: 64Mi
        - name: nextjs-cache
          emptyDir:
            sizeLimit: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: marketing-portal
  namespace: tiresias
  labels:
    app: marketing-portal
    app.kubernetes.io/name: marketing-portal
    app.kubernetes.io/part-of: tiresias
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: marketing-portal
```

### 8c. Ingress split

Update `k8s/ingress.yaml` to split traffic between the two hosts:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tiresias-ingress
  namespace: tiresias
  labels:
    app.kubernetes.io/part-of: tiresias
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "tiresias-cert,tiresias-proxy-cert,tiresias-platform-cert"
    kubernetes.io/ingress.global-static-ip-name: "tiresias-ip"
    networking.gke.io/v1beta1.FrontendConfig: "tiresias-frontend"
spec:
  rules:
    # ---- tiresias.network (marketing) ----
    - host: tiresias.network
      http:
        paths:
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: marketing-portal
                port:
                  number: 80

    # ---- platform.tiresias.network (app) ----
    - host: platform.tiresias.network
      http:
        paths:
          # SoulGate routes
          - path: /gate/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulgate
                port:
                  number: 80
          # SoulWatch routes
          - path: /watch/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulwatch
                port:
                  number: 80
          # SoulAuth API routes
          - path: /health
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /auth/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /tokens/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /policies/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /tenants/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /admin/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /sdk/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /metrics
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /v1/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: soulauth
                port:
                  number: 80
          - path: /api/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: portal
                port:
                  number: 80
          # Portal frontend (catch-all, must be last)
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: portal
                port:
                  number: 80

    # ---- proxy.tiresias.network ----
    - host: proxy.tiresias.network
      http:
        paths:
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: tiresias-proxy
                port:
                  number: 80
```

### 8d. Stripe webhook continuity

The Stripe webhook endpoint is `POST /api/billing/webhook` on the portal. After the split:

- **Stripe dashboard webhook URL must be updated** from `https://tiresias.network/api/billing/webhook` to `https://platform.tiresias.network/api/billing/webhook`
- Do this **before** switching Ingress, or keep `tiresias.network/api/*` routing to the portal service temporarily during transition
- The `STRIPE_WEBHOOK_SECRET` stays the same unless you create a new endpoint in Stripe

### 8e. Update platform portal env var

```yaml
# k8s/portal-deployment.yaml -- UPDATE
- name: NEXT_PUBLIC_APP_URL
  value: "https://platform.tiresias.network"  # was https://tiresias.network
```

### 8f. Apply in order

```bash
# 1. Deploy marketing-portal
kubectl apply -f k8s/marketing-portal-deployment.yaml

# 2. Wait for pods to be ready
kubectl -n tiresias rollout status deployment/marketing-portal

# 3. Update portal env (triggers rolling restart)
kubectl apply -f k8s/portal-deployment.yaml

# 4. Apply ingress changes (instant traffic switch)
kubectl apply -f k8s/ingress.yaml
```

---

## 9. Phase 5: Clean Up Platform

After the split is live and verified, remove marketing pages from the platform deployment.

### 9a. Pages to remove from platform

Delete these directories from `portal/src/app/`:

- `page.tsx` (landing page -- replace with redirect)
- `platform/` (entire directory)
- `pricing/`
- `use-cases/`
- `developers/`
- `docs/` (top-level public docs)
- `company/`
- `security/`
- `legal/`
- `sitemap.ts`
- `robots.ts` (or replace with platform-specific version)
- `structured-data.tsx`
- `content/` (blog, docs markdown)

### 9b. Replace landing page with redirect

```tsx
// portal/src/app/page.tsx -- REPLACE
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

Unauthenticated users hitting `platform.tiresias.network/` will get redirected to `/dashboard`, which triggers the dashboard layout auth check, which redirects to `/login`.

### 9c. Remove marketing components from platform

- Delete `portal/src/components/layout/Navbar.tsx`
- Delete `portal/src/components/layout/Footer.tsx`
- Remove any imports of these in remaining pages

### 9d. Update platform robots.ts

```typescript
// portal/src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: ["/"] }],
  };
}
```

---

## 10. Phase 6: Legacy Redirects

After the split, users/bookmarks/search engines may still hit old URLs on the wrong domain. Add redirects.

### 10a. On marketing site (tiresias.network)

In `marketing-portal/next.config.ts`:

```typescript
async redirects() {
  return [
    // Dashboard deep links -> platform
    { source: "/dashboard/:path*", destination: "https://platform.tiresias.network/dashboard/:path*", permanent: true },
    { source: "/api/:path*", destination: "https://platform.tiresias.network/api/:path*", permanent: false },
    { source: "/billing/:path*", destination: "https://platform.tiresias.network/billing/:path*", permanent: true },
    { source: "/checkout/:path*", destination: "https://platform.tiresias.network/checkout/:path*", permanent: true },
    { source: "/forgot-password", destination: "https://platform.tiresias.network/forgot-password", permanent: true },
    { source: "/reset-password", destination: "https://platform.tiresias.network/reset-password", permanent: true },
  ];
},
```

### 10b. On platform (platform.tiresias.network)

In `portal/next.config.ts`:

```typescript
async redirects() {
  return [
    // Marketing pages -> marketing site
    { source: "/platform/:path*", destination: "https://tiresias.network/platform/:path*", permanent: true },
    { source: "/pricing", destination: "https://tiresias.network/pricing", permanent: true },
    { source: "/use-cases", destination: "https://tiresias.network/use-cases", permanent: true },
    { source: "/developers", destination: "https://tiresias.network/developers", permanent: true },
    { source: "/docs", destination: "https://tiresias.network/docs", permanent: true },
    { source: "/docs/:path*", destination: "https://tiresias.network/docs/:path*", permanent: true },
    { source: "/company", destination: "https://tiresias.network/company", permanent: true },
    { source: "/security", destination: "https://tiresias.network/security", permanent: true },
    { source: "/legal", destination: "https://tiresias.network/legal", permanent: true },
  ];
},
```

---

## 11. What NOT to Change

These backend systems are untouched by this split:

| Component | Why |
|---|---|
| **SoulAuth backend** | Internal ClusterIP service, accessed by portal via `SOULAUTH_INTERNAL_URL`. No public URL change. |
| **SoulWatch backend** | Internal ClusterIP service. Ingress path `/watch/*` just moves to `platform.tiresias.network`. |
| **SoulGate backend** | Internal ClusterIP service. Ingress path `/gate/*` just moves to `platform.tiresias.network`. |
| **Tiresias Proxy** | Separate subdomain (`proxy.tiresias.network`). Completely independent. |
| **Database (PostgreSQL)** | No schema or connection changes. |
| **Redis** | No changes. |
| **Agent pipeline** | Not affected. |
| **Stripe billing logic** | Code stays in platform portal. Only webhook URL changes. |
| **Docker Compose (local dev)** | Single portal is fine for local dev. Split is production-only. |
| **GKE namespace** | Everything stays in `tiresias` namespace. |

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Cookie breakage during transition** | Medium | High (users logged out) | Phase 0 deploys `COOKIE_DOMAIN` support first. Set `COOKIE_DOMAIN=.tiresias.network` before switching DNS. Test with `curl -v` to verify `Set-Cookie` headers include `Domain=.tiresias.network`. |
| **OAuth callback URL mismatch** | High | High (SSO login broken) | Update Google/WorkOS redirect URIs BEFORE switching DNS (see Section 15). Add both old and new URIs during transition window. |
| **SEO ranking drop** | Low | Medium | 301 redirects preserve link equity. Keep `sitemap.xml` on `tiresias.network`. Submit updated sitemap to Google Search Console. No URL changes for marketing pages. |
| **Stripe webhook delivery failure** | Medium | High (missed payments) | Add new webhook endpoint in Stripe dashboard pointing to `platform.tiresias.network` BEFORE removing old Ingress rule. Keep both endpoints active for 48 hours. |
| **ManagedCertificate provisioning delay** | Low | Medium (HTTPS unavailable) | GKE ManagedCerts take 10-15 minutes. Apply cert YAML at start of Phase 2, verify with `kubectl describe managedcertificate`. Do not switch DNS until cert status is `Active`. |
| **Hardcoded `tiresias.network` URLs in code** | Medium | Low (broken links) | Grep for `tiresias.network` across all portal code. Replace with `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_PLATFORM_URL` env vars. |
| **Trial signup form breaks** | Low | Medium | Trial page lives on marketing site but the API POST goes to platform. Use absolute URL: `https://platform.tiresias.network/api/...`. Test E2E. |

---

## 13. Rollback Plan

Each phase is independently reversible:

| Phase | Rollback |
|---|---|
| **Phase 0** (cookie domain support) | Remove `COOKIE_DOMAIN` env var. Cookies revert to host-only. No user impact. Revert `sameSite` changes if needed (unlikely). |
| **Phase 1** (marketing site built) | Delete the deployment. Marketing site was never receiving traffic. |
| **Phase 2** (DNS + TLS) | Delete the `tiresias-platform-cert` ManagedCertificate. Revert DNS record. Takes 5 minutes. |
| **Phase 3** (cross-domain cookies) | Remove `COOKIE_DOMAIN` env var from portal deployment. Rolling restart clears it. Users need to re-login. |
| **Phase 4** (deploy + ingress split) | Revert `k8s/ingress.yaml` to original (single-host). `kubectl apply -f k8s/ingress.yaml`. Instant rollback. Scale down marketing-portal to 0. Revert portal `NEXT_PUBLIC_APP_URL`. |
| **Phase 5** (platform cleanup) | This is a code-only change in the portal repo. `git revert` the cleanup commit. Rebuild and redeploy. |
| **Phase 6** (legacy redirects) | Remove redirect rules from next.config. Rebuild both sites. |

**Emergency full rollback (all phases):**

```bash
# 1. Revert ingress to original
git checkout HEAD~N -- k8s/ingress.yaml
kubectl apply -f k8s/ingress.yaml

# 2. Remove COOKIE_DOMAIN
kubectl -n tiresias set env deployment/portal COOKIE_DOMAIN-

# 3. Revert NEXT_PUBLIC_APP_URL
kubectl -n tiresias set env deployment/portal NEXT_PUBLIC_APP_URL=https://tiresias.network

# 4. Scale down marketing-portal
kubectl -n tiresias scale deployment/marketing-portal --replicas=0

# 5. Revert DNS (Cloudflare dashboard)
# Remove platform.tiresias.network A record
```

Time to full rollback: under 5 minutes.

---

## 14. Pre-existing Bugs to Fix

### 14a. /platform layout auth gate (critical)

**File:** `portal/src/app/platform/layout.tsx`

**Bug:** The layout wraps `/platform`, `/platform/soulauth`, `/platform/soulwatch`, and `/platform/soulgate` with a client-side auth check. These are public marketing pages that describe the product. Unauthenticated visitors are redirected to `/login`.

**Root cause:** The layout was likely copied from the `/dashboard` layout pattern. The `/platform` routes predate the auth system.

**Fix:** See Phase 0, Section 4a. Remove the `useAuth()` check entirely. These pages should render for everyone.

**Impact if not fixed:** Marketing pages are invisible to non-logged-in visitors. Every prospective customer gets bounced to login.

---

## 15. OAuth Provider Updates Needed

### 15a. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

**Authorized redirect URIs -- add:**
```
https://platform.tiresias.network/api/auth/callback
```

**Keep existing during transition:**
```
https://tiresias.network/api/auth/callback
```

Remove the old URI after Phase 4 is stable (48 hours).

### 15b. WorkOS (if configured)

In [WorkOS Dashboard](https://dashboard.workos.com):

**Redirect URI -- add:**
```
https://platform.tiresias.network/api/auth/callback
```

Keep old URI during transition.

### 15c. SoulAuth backend configuration

The SoulAuth backend constructs the `redirect_uri` using the `portal_base_url` parameter passed from `/api/auth/authorize`. Since the authorize route already reads `NEXT_PUBLIC_APP_URL` (via `getBaseUrl()`), updating the env var on the portal deployment is sufficient. No SoulAuth backend changes needed.

**Verify:** After updating `NEXT_PUBLIC_APP_URL` to `https://platform.tiresias.network`, confirm the authorize route sends `portal_base_url=https://platform.tiresias.network` to SoulAuth.

---

## 16. Timeline

| Day | Phase | Duration | Risk |
|---|---|---|---|
| **Day 1 AM** | Phase 0: Deploy cookie domain support + fix sameSite + fix /platform auth gate | 1-2 hours | None (backward compatible) |
| **Day 1 PM** | Phase 1: Build marketing-portal, copy files, test locally | 3-4 hours | None (parallel work) |
| **Day 1 PM** | Phase 2: Apply ManagedCertificate YAML, add DNS record, wait for cert provisioning | 30 min + wait | None (cert provisioning is passive) |
| **Day 2 AM** | Phase 3: Set `COOKIE_DOMAIN=.tiresias.network` on portal deployment | 5 min | Low (test cross-domain cookies) |
| **Day 2 AM** | Update OAuth provider redirect URIs (Google, WorkOS) | 15 min | None |
| **Day 2 AM** | Update Stripe webhook URL | 5 min | None (add new, keep old) |
| **Day 2 PM** | Phase 4: Deploy marketing-portal, update Ingress | 30 min | Medium (the switch) |
| **Day 2 PM** | Verify: login flow, OAuth callback, dashboard, billing, trial signup | 1 hour | - |
| **Day 3 AM** | Phase 5: Clean up platform (remove marketing pages) | 1-2 hours | Low |
| **Day 3 AM** | Phase 6: Add legacy redirects | 30 min | Low |
| **Day 3 PM** | Remove old OAuth redirect URIs, old Stripe webhook | 15 min | None |

**Total effort:** ~10-12 hours of work across 2-3 days.
**Downtime:** Zero. All changes are additive until the Ingress switch, which is atomic.
