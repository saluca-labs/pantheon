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
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const sessionDataCookie = request.cookies.get(SESSION_DATA_COOKIE);

  // Both cookies must be present
  if (!sessionCookie?.value || !sessionDataCookie?.value) {
    return false;
  }

  // Session cookie must have a non-empty value
  if (sessionCookie.value.length < 10) {
    return false;
  }

  try {
    const data = JSON.parse(decodeURIComponent(sessionDataCookie.value));

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
  ],
};
