import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth');
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isHealthCheck = req.nextUrl.pathname === '/api/health';
  // Allow auth routes, login page, and health check always
  if (isAuthRoute || isLoginPage || isHealthCheck) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn) {
    // For API routes, return 401
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For pages, redirect to login
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // CSRF protection for mutating API requests
  const method = req.method.toUpperCase();
  if (req.nextUrl.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Reject non-JSON content types on body-carrying methods (except SSE stream endpoints)
    if (['POST', 'PUT', 'PATCH'].includes(method) && !req.nextUrl.pathname.endsWith('/stream')) {
      const contentType = req.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
      }
    }
  }

  const startTime = Date.now();
  const response = NextResponse.next();

  // Add request ID and timing for tracing
  const requestId = crypto.randomUUID().slice(0, 8);
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Prevent caching of API responses containing user data
  if (req.nextUrl.pathname.startsWith('/api/') && !isHealthCheck) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
});

export const config = {
  matcher: [
    // Match all routes except static files, _next, favicon, and auth API routes
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
