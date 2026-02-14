import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { signToken, COOKIE_NAME, MAX_AGE } from '@/lib/auth';

/**
 * Handle login POST requests by validating the provided password and issuing an authentication cookie on success.
 *
 * @returns A `NextResponse` containing `{ success: true }` and a cookie named `COOKIE_NAME` with the signed token when the password is valid; otherwise a JSON error `{ error: 'Invalid password' }` with HTTP status `401`.
 */
export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = signToken();
  const isLocalhost = request.headers.get('host')?.startsWith('localhost') ?? false;

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
    secure: !isLocalhost,
  });

  return response;
}