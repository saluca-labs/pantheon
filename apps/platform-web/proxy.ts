import { authkit, handleAuthkitHeaders } from '@workos-inc/authkit-nextjs';
import { NextRequest, NextResponse } from 'next/server';

export default async function proxy(request: NextRequest) {
  const { session, headers } = await authkit(request);
  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users to /login for protected routes
  if (pathname.startsWith('/dashboard') && !session.user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from /login
  if (pathname === '/login' && session.user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  // CRITICAL: /callback MUST be excluded — session cookie doesn't exist yet
  // during WorkOS redirect. If proxy intercepts /callback, auth breaks entirely.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|callback).*)'],
};
