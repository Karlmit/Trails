import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE_NAME, validateSession } from '@/lib/session';

// AD-7: exactly three route classes exist. This foundation spec only needs
// two of them: `requireAuth` (everything Trip-owned) and the one-time
// bootstrap gate. `requireAdmin` and `public` (Guest) are not wired up yet
// -- Admin-issued accounts and Guest/public access are deferred.

/** Reads the session token from the request cookie (Server Component use). */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const result = await validateSession(token);
  return result?.user ?? null;
}

/** True once at least one User account exists (bootstrap has run). */
export async function hasAnyUsers(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}

/**
 * Extracts the session token from a Route Handler's request: a `Bearer`
 * Authorization header first (the shape a future mobile client uses per
 * AD-6), falling back to the browser's httpOnly cookie.
 */
export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim();
  }
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Resolves the acting User for a Route Handler request, or `null`. */
export async function getUserFromApiRequest(request: NextRequest): Promise<User | null> {
  const token = extractToken(request);
  const result = await validateSession(token);
  return result?.user ?? null;
}
