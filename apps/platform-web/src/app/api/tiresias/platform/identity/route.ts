import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/app/api/tiresias/_lib/proxy';

/**
 * BFF → platform-api identity echo.
 *
 * The proxy authenticates via local session cookie, then forwards to
 * platform-api with X-Tiresias-User-Id / -Role / -Team-Id headers.
 * The upstream simply echoes those values plus a server timestamp,
 * which is useful as an end-to-end smoke test of the identity contract.
 */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/v1/platform/identity');
}
