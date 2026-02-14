import 'server-only';
import jwt from 'jsonwebtoken';
import { MAX_AGE } from '@/lib/constants';

export { COOKIE_NAME, MAX_AGE } from '@/lib/constants';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

/**
 * Create a signed JSON Web Token representing an authenticated session.
 *
 * @returns A JWT string signed with the configured secret and set to expire after `MAX_AGE`.
 */
export function signToken(): string {
  return jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: MAX_AGE });
}

/**
 * Checks whether a JSON Web Token is valid using the configured JWT secret.
 *
 * @param token - The JWT string to verify.
 * @returns `true` if the token is valid, `false` otherwise.
 */
export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}