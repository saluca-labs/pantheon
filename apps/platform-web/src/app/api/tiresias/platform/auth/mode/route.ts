import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/app/api/tiresias/_lib/proxy';

/**
 * BFF → platform-api: discover the active AUTH_MODE.
 *
 * Used by the web client to render the appropriate sign-in UI: a local
 * email/password form when AUTH_MODE=local, or a redirect button to the
 * OIDC provider when AUTH_MODE=oidc.
 */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/v1/auth/mode');
}
