import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/constants';

// JWT verification inline (can't import server-only module in middleware edge runtime)
async function isValidToken(token: string): Promise<boolean> {
  // Middleware runs in Edge Runtime which doesn't support jsonwebtoken.
  // We do a simple JWT structure + expiry check here.
  // The full crypto verification happens in API routes.
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp < Date.now() / 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allowlist: public routes
  const publicPaths = ['/login', '/api/auth'];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !(await isValidToken(token))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, manifest.json, icons
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.json|icons).*)',
  ],
};
