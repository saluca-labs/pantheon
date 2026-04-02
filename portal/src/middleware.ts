import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "tiresias_session";
const SESSION_DATA_COOKIE = "tiresias_session_data";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/dashboard"];

/** Routes that should redirect to dashboard if already logged in */
const AUTH_ROUTES = ["/login"];

/**
 * Validate that the session data cookie contains valid, non-expired data.
 * The actual soulkey is in an HttpOnly cookie and cannot be read here in
 * Edge middleware, but we can validate the session metadata and expiry.
 */
function isSessionValid(request: NextRequest): boolean {
  // Check SoulKey session cookies
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const sessionDataCookie = request.cookies.get(SESSION_DATA_COOKIE);

  // Check OIDC / local-auth session cookies
  const oidcSessionCookie = request.cookies.get("tiresias_oidc_session");
  const oidcDataCookie = request.cookies.get("tiresias_oidc_data");

  // Either cookie pair is valid
  const hasSession = (sessionCookie?.value && sessionCookie.value.length >= 10 && sessionDataCookie?.value)
    || (oidcSessionCookie?.value && oidcSessionCookie.value.length >= 10 && oidcDataCookie?.value);

  if (!hasSession) {
    return false;
  }

  // Validate whichever data cookie is present
  const dataCookieValue = sessionDataCookie?.value || oidcDataCookie?.value;
  if (!dataCookieValue) return false;

  try {
    const data = JSON.parse(decodeURIComponent(dataCookieValue));

    // Validate required fields exist
    if (!data.tenant_id || !data.expires_at) {
      return false;
    }

    // Check session expiry
    if (typeof data.expires_at === "number" && Date.now() > data.expires_at) {
      return false;
    }

    return true;
  } catch {
    // Invalid JSON in session data cookie
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const validSession = isSessionValid(request);

  // On-prem: root path redirects to /dashboard (authenticated) or /login
  if (pathname === "/") {
    const target = validSession ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(target, request.url));
  }

  // Protect /platform/* and /dashboard/* routes
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !validSession) {
    // Clear invalid cookies before redirecting
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);

    // If cookies exist but are invalid, clear them
    if (request.cookies.has(SESSION_COOKIE) || request.cookies.has(SESSION_DATA_COOKIE)) {
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set("tiresias_tenant", "", { path: "/", maxAge: 0 });
    }

    return response;
  }

  // Redirect logged-in users away from /login
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && validSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Inject X-SoulKey header for /v1/* and /dash/* API requests so the Next.js rewrite
  // forwards authentication to the soulauth backend.  The SoulKey lives in
  // an HttpOnly cookie that client-side JS cannot read, but middleware can.
  if (pathname.startsWith("/v1/") || pathname.startsWith("/dash/")) {
    const soulkey = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get("tiresias_oidc_session")?.value;
    if (soulkey) {
      const headers = new Headers(request.headers);
      headers.set("X-SoulKey", soulkey);
      headers.set("Authorization", `Bearer ${soulkey}`);
      return NextResponse.next({
        request: { headers },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/login",
    "/v1/:path*",
    "/dash/:path*",
  ],
};
