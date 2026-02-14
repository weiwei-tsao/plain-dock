import { NextRequest, NextResponse } from 'next/server';
import { signToken, COOKIE_NAME, MAX_AGE } from '@/lib/auth';

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
