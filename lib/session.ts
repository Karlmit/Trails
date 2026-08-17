import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Session, User } from '@prisma/client';

// AD-6: one login endpoint issues an opaque token both a browser (httpOnly
// cookie) and a future mobile client (JSON body) can use, backed by a
// single `sessions` table with exactly one invalidation path
// (`revokeSession`). A session is valid only if
// `expires_at > now() AND revoked_at IS NULL`.

export const SESSION_COOKIE_NAME = 'trails_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Whether the session cookie is marked `Secure`. Deliberately driven by an
// explicit env var, not `NODE_ENV`: `NODE_ENV=production` only describes the
// build/runtime mode, not whether the deployment is actually served over
// HTTPS (see docker-compose.yml, which runs `NODE_ENV: production` over
// plain HTTP with no TLS anywhere). A `Secure` cookie set from a non-HTTPS
// response is silently dropped by real browsers, so login would appear to
// succeed while the session never persists. Default to `false` so the app
// works out of the box over plain HTTP; operators fronting it with their
// own TLS/reverse proxy can opt in via `COOKIE_SECURE=true`.
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/** Creates a new session row for `userId` and returns its opaque token. */
export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * Validates an opaque session token and returns the User it belongs to, or
 * `null` if the token is missing, unknown, expired, or revoked. This is the
 * one authoritative check `middleware.ts` (Node.js runtime) uses -- no
 * lightweight Edge check exists alongside it (AD-6).
 */
export async function validateSession(
  token: string | undefined | null,
): Promise<{ session: Session; user: User } | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const { user, ...sessionOnly } = session;
  return { session: sessionOnly, user };
}

/**
 * Ends a session before its natural expiry. This is the only path allowed
 * to mutate a `sessions` row's `revoked_at` -- no feature deletes or
 * otherwise mutates a session row any other way (AD-6). Idempotent: revoking
 * an already-revoked or unknown token is a no-op, not an error.
 */
export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
