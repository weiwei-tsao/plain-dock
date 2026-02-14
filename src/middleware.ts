import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/constants';

/**
 * Checks whether a JWT string is structurally valid and not expired.
 *
 * This performs a lightweight validation: verifies the token has three JWT segments
 * and that the payload's `exp` (if present) is in the future. It does not perform
 * cryptographic signature verification.
 *
 * @param token - The JWT compact serialization (three dot-separated segments)
 * @returns `true` if the token is well-formed and its `exp` claim (when present) is in the future, `false` otherwise.
 */
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

/**
 * Enforces authentication for incoming requests, allowing listed public paths and otherwise forwarding, redirecting, or rejecting requests based on token validity.
 *
 * If the request pathname starts with a public path, the request proceeds. If no valid token is present, API requests receive a 401 JSON response and other requests are redirected to `/login`. Valid tokens allow the request to proceed.
 *
 * @param request - The incoming Next.js Edge request to evaluate for authentication
 * @returns A NextResponse that either continues the request, redirects the client to `/login`, or returns a 401 JSON body `{ error: 'Unauthorized' }` for API routes
 */
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