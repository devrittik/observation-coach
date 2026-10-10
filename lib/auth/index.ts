import { scrypt as scryptCb, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { findUserByToken, saveLogin, deleteLogin } from '@/lib/db';
import { debug } from '@/lib/log';
import type { User } from '@/lib/types';
const scrypt = promisify(scryptCb);
export const cookieName = 'observation_session';
// HTTPS embedded previews need partitioned cross-site cookies. Default local/top-level
// deployments retain SameSite=Lax. Origin checks still protect all mutations.
function cookieOptions() {
  const embedded = process.env.COOKIE_EMBEDDED === 'true';
  return {
    httpOnly: true,
    sameSite: embedded ? ('none' as const) : ('lax' as const),
    secure:
      embedded ||
      (process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production'),
    partitioned: embedded,
    path: '/',
  };
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  try {
    const [salt, hex] = stored.split(':');
    const key = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hex, 'hex');
    return expected.length === key.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  debug('auth', 'resolving session cookie');
  return findUserByToken(digest(token));
}
export async function createLogin(uid: string, isDemo = false) {
  const previous = (await cookies()).get(cookieName)?.value;
  const token = randomBytes(32).toString('hex');
  const maxAge = isDemo ? 86400 : 60 * 60 * 24 * 14;
  await saveLogin(
    uid,
    digest(token),
    new Date(Date.now() + maxAge * 1000),
    previous ? digest(previous) : undefined,
  );
  (await cookies()).set(cookieName, token, {
    ...cookieOptions(),
    maxAge,
  });
  debug('auth', 'session token issued', { userId: uid, demo: isDemo, maxAgeSeconds: maxAge });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await deleteLogin(digest(token));
  jar.set(cookieName, '', { ...cookieOptions(), maxAge: 0 });
  debug('auth', 'logged out', { revoked: !!token });
}
