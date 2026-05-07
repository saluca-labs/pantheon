import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'platform_session';

/**
 * Middleware: gate all dashboard routes behind session cookie.
 * Full session validation (DB lookup) happens in the layout server component.
 * Middleware only checks for cookie presence to avoid DB calls on every request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth, public, and API routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for session cookie on all other routes
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
