import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { localeSchema } from '@/lib/validation';
import { serializeUser } from '@/lib/serializers';

// Multi-language support: self-service profile endpoint, distinct from the
// Admin-only app/api/v1/users/route.ts.
//   PATCH /api/v1/me -- update the acting User's own language preference.

export async function PATCH(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = localeSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { locale: parsed.locale },
  });

  return NextResponse.json(serializeUser(updated));
}
