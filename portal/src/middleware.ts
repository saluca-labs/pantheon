import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "tiresias_session";
const SESSION_DATA_COOKIE = "tiresias_session_data";
const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";

/** Routes that require authentication */
const PROTECTED_PREFIXES = ["/platform", "/dashboard"];

/** Routes that should redirect to dashboard if already logged in */
const AUTH_ROUTES = ["/login"];

/**
 * Validate a SoulKey session.
 * Checks both the HttpOnly session token cookie and the session data cookie.
 */
function isSoulKeySessionValid(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const sessionDataCookie = request.cookies.get(SESSION_DATA_COOKIE);

  if (!sessionCookie?.value || !sessionDataCookie?.value) return false;
  if (sessionCookie.value.length < 10) return false;

  try {
    const data = JSON.parse(decodeURIComponent(sessionDataCookie.value));
    if (!data.tenant_id || !data.expires_at) return false;
    if (typeof data.expires_at === "number" && Date.now() > data.expires_at) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an OIDC session.
 * Checks both the HttpOnly OIDC session token cookie and the OIDC data cookie.
 */
function isOIDCSessionValid(request: NextRequest): boolean {
  const oidcSessionCookie = request.cookies.get(OIDC_SESSION_COOKIE);
  const oidcDataCookie = request.cookies.get(OIDC_DATA_COOKIE);

  if (!oidcSessionCookie?.value || !oidcDataCookie?.value) return false;
  if (oidcSessionCookie.value.length < 10) return false;

  try {
    const data = JSON.parse(decodeURIComponent(oidcDataCookie.value));
    if (!data.tenant_id || !data.expires_at) return false;
    if (typeof data.expires_at === "number" && Date.now() > data.expires_at) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Return true if EITHER a valid SoulKey session OR a valid OIDC session exists.
 */
function isSessionValid(request: NextRequest): boolean {
  return isSoulKeySessionValid(request) || isOIDCSessionValid(request);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const validSession = isSessionValid(request);

  // Protect /platform/* and /dashboard/* routes
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !validSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);

    // Clear any stale cookies
    const hasSoulKey = request.cookies.has(SESSION_COOKIE) || request.cookies.has(SESSION_DATA_COOKIE);
    const hasOIDC = request.cookies.has(OIDC_SESSION_COOKIE) || request.cookies.has(OIDC_DATA_COOKIE);

    if (hasSoulKey) {
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set("tiresias_tenant", "", { path: "/", maxAge: 0 });
    }
    if (hasOIDC) {
      response.cookies.set(OIDC_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(OIDC_DATA_COOKIE, "", { path: "/", maxAge: 0 });
    }

    return response;
  }

  // Redirect logged-in users away from /login
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && validSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/platform/:path*",
    "/dashboard/:path*",
    "/login",
  ],
};
