import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { getUserFromApiRequest, isAdmin } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { credentialsSchema } from '@/lib/validation';
import { serializeUser } from '@/lib/serializers';
import { isUniqueConstraintViolationError } from '@/lib/db-errors';

// FR-30, spec-admin-users: AD-7's third route class, `requireAdmin`, wired
// up here as an application-level role check layered on top of proxy.ts's
// existing `requireAuth` gate (proxy.ts already requires a valid session for
// every /api/v1/** path including this one -- it is never touched by this
// spec).
//   GET  /api/v1/users -- list every account (Admin-only), for the
//                          /admin/users management page.
//   POST /api/v1/users -- create a new `role: 'USER'` account (Admin-only).
//                          Reuses the exact same credentialsSchema/
//                          hashPassword conventions as PUT /api/v1/auth's
//                          signup path, but never issues a session for the
//                          new account -- the acting Admin stays logged in
//                          as themselves.

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();
  if (!isAdmin(user)) return Errors.forbidden();

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json(users.map(serializeUser));
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();
  if (!isAdmin(user)) return Errors.forbidden();

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

  try {
    const created = await prisma.user.create({
      data: {
        username: parsed.username,
        passwordHash,
        role: 'USER',
      },
    });

    // AD-12: every mutation revalidates the Server Components it affects --
    // without this, a second tab/Admin session viewing /admin/users would
    // show a stale list until a hard reload, relying on this tab's own
    // router.refresh() alone (the anti-pattern AD-12 exists to prevent).
    revalidatePath('/admin/users');

    return NextResponse.json(serializeUser(created), { status: 201 });
  } catch (err) {
    if (isUniqueConstraintViolationError(err)) {
      return Errors.conflict('That username is already taken');
    }
    throw err;
  }
}
