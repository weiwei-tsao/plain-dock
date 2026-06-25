import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/constants';

/**
 * Edge-compatible JWT HMAC-SHA256 signature verification using Web Crypto API.
 * Replaces the previous structure-only check that allowed forged tokens.
 */
async function isValidToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode and check expiry
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp < Date.now() / 1000) return false;

    // Verify HMAC-SHA256 signature via Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // JWT signature is base64url-encoded — convert to standard base64 for atob
    const signatureB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));

    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    return await crypto.subtle.verify('HMAC', key, signatureBytes, data);
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
    '/((?!_next/static|_next/image|favicon.ico|icon\\.svg|robots.txt|manifest.json|icons).*)',
  ],
};
