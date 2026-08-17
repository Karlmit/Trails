import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/password';
import { issueSession, revokeSession, COOKIE_SECURE, SESSION_COOKIE_NAME } from '@/lib/session';
import { Errors } from '@/lib/api-errors';
import { extractToken } from '@/lib/auth';
import { isSerializationFailure } from '@/lib/db-errors';

// FR-29/FR-30, AD-6, AD-7: signup (zero-Users bootstrap gate) + login/logout,
// all on one Route Handler file, discriminated by HTTP method:
//   PUT    /api/v1/auth  -- signup, only reachable while `users` is empty
//   POST   /api/v1/auth  -- login
//   DELETE /api/v1/auth  -- logout

const credentialsSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(64),
  password: z.string().min(8, 'Password must be at least 8 characters').max(256),
});

function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

// Sentinel thrown from inside the signup transaction to distinguish "signup
// is closed" from any other unexpected transaction failure.
const SIGNUP_CLOSED = Symbol('signup-closed');

/**
 * PUT — signup. Permanently closed the instant the first account exists.
 *
 * The zero-Users check and the account insert are wrapped in a single
 * Serializable transaction so two concurrent signup requests during the
 * zero-user window can't both observe zero Users and both get created as
 * ADMIN -- Postgres aborts the loser with a serialization failure, which is
 * treated the same as "signup already closed" (410).
 */
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = credentialsSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const passwordHash = await hashPassword(parsed.password);

  let user;
  try {
    user = await prisma.$transaction(
      async (tx) => {
        const existingUsers = await tx.user.count();
        if (existingUsers > 0) {
          throw SIGNUP_CLOSED;
        }

        // First-run bootstrap: the first account is auto-granted Admin (FR-29).
        return tx.user.create({
          data: {
            username: parsed.username,
            passwordHash,
            role: 'ADMIN',
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err === SIGNUP_CLOSED || isSerializationFailure(err)) {
      return Errors.gone('Signup is closed. An account already exists on this instance.');
    }
    throw err;
  }

  const { token, expiresAt } = await issueSession(user.id);

  const response = NextResponse.json(
    {
      user: { id: user.id, username: user.username, role: user.role },
      token,
    },
    { status: 201 },
  );
  setSessionCookie(response, token, expiresAt);
  return response;
}

/** POST — login. Wrong credentials always return the same generic 401. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = credentialsSchema.parse(body);
  } catch {
    // Deliberately generic: a malformed login attempt looks the same as a
    // wrong-password one to anyone probing the endpoint.
    return Errors.invalidCredentials();
  }

  const user = await prisma.user.findUnique({ where: { username: parsed.username } });
  if (!user) {
    return Errors.invalidCredentials();
  }

  const passwordOk = await verifyPassword(user.passwordHash, parsed.password);
  if (!passwordOk) {
    return Errors.invalidCredentials();
  }

  const { token, expiresAt } = await issueSession(user.id);

  const response = NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
    token,
  });
  setSessionCookie(response, token, expiresAt);
  return response;
}

/** DELETE — logout. Idempotent: revoking an unknown/already-revoked token is a no-op. */
export async function DELETE(request: NextRequest) {
  const token = extractToken(request);
  if (token) {
    await revokeSession(token);
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
