import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

/**
 * Invalidate the authentication cookie and return a success response.
 *
 * Sets the cookie named by `COOKIE_NAME` to an empty value with `httpOnly`, `sameSite: 'lax'`, `maxAge: 0`, and `path: '/'` to clear client authentication.
 *
 * @returns A NextResponse with JSON `{ success: true }` and the cleared authentication cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}