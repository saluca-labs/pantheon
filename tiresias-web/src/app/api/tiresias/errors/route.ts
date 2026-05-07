import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/app/api/tiresias/_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/dash/v1/errors');
}
