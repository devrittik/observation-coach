import { NextRequest, NextResponse } from 'next/server';
import { logAccess } from '@/lib/server/http-log';

// Note: Next 16 proxy runs on the Node.js runtime, so morgan works here as-is.

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  logAccess({
    method: request.method,
    url: request.nextUrl.pathname + request.nextUrl.search,
    status: response.status,
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    referer: request.headers.get('referer') || undefined,
  });
  return response;
}

export const config = {
  // Pages and app routes produce access lines. Static assets are noise, and /api is
  // logged by the route handler instead so the line carries the final status and size.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|fonts/|.*\\.(?:svg|png|jpe?g|webp|ico|map|txt)$).*)',
  ],
};
