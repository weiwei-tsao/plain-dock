import 'server-only';
import jwt from 'jsonwebtoken';
import { MAX_AGE } from '@/lib/constants';

export { COOKIE_NAME, MAX_AGE } from '@/lib/constants';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(): string {
  return jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: MAX_AGE });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}
