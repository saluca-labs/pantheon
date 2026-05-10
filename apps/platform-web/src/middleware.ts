import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'platform_session';
const TIRESIAS_SESSION_COOKIE = 'tiresias_session';

/**
 * Middleware: gate all dashboard routes behind session cookie.
 * Full session validation (DB lookup) happens in the layout server component.
 * Middleware only checks for cookie presence to avoid DB calls on every request.
 *
 * Federation bridge (Option C): when `platform_session` is missing but the
 * portal-issued `tiresias_session` is present, route the request through
 * /api/auth/exchange instead of /login. The exchange route verifies the
 * tiresias token against SoulAuth, mints a local platform_session, and
 * redirects back to the original path. From the user's perspective, the
 * SoulAuth login carries seamlessly across to platform-web.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth, public, and API routes.
  //
  // Note: ALL /api/* routes are exempted from the middleware redirect — API
  // handlers are responsible for their own auth (returning JSON 401/403).
  // Otherwise the middleware would 307 to /login and clients (smoke tests,
  // BFF proxies, the React server-actions) would receive HTML instead of
  // the JSON contract they expect.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for local platform session
  const platformToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (platformToken) {
    return NextResponse.next();
  }

  // No platform_session — but if the portal session is present, send the
  // request through the exchange BFF so we can mint one without bouncing
  // the user to /login. The exchange route will redirect back to the
  // original path on success or fall through to /login on failure.
  const tiresiasToken = req.cookies.get(TIRESIAS_SESSION_COOKIE)?.value;
  if (tiresiasToken) {
    const exchangeUrl = new URL('/api/auth/exchange', req.url);
    exchangeUrl.searchParams.set(
      'returnTo',
      pathname + req.nextUrl.search
    );
    return NextResponse.redirect(exchangeUrl);
  }

  // No session of any kind — fall back to /login as before.
  const loginUrl = new URL('/login', req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
