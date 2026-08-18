import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { sectionCreateSchema } from '@/lib/validation';
import { serializeSection } from '@/lib/serializers';
import { isForeignKeyViolationError, isSectionOverlapViolation } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

// FR-5, AD-2: Sections are a pure date-range band on a Trip, with no
// item-assignment field. The overlap rule is enforced by the database
// (EXCLUDE USING gist, prisma/migrations/20260817131140_init/migration.sql)
// -- this route only translates that DB error into a clean 400.

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return Errors.validation('tripId query parameter is required');
  if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');

  const sections = await prisma.section.findMany({
    where: { tripId },
    orderBy: { startDate: 'asc' },
  });
  return NextResponse.json(sections.map(serializeSection));
}

export async function POST(request: NextRequest) {
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
    parsed = sectionCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const trip = await prisma.trip.findUnique({ where: { id: parsed.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  try {
    const section = await prisma.section.create({
      data: {
        tripId: parsed.tripId,
        name: parsed.name,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        color: parsed.color ?? null,
        emoji: parsed.emoji ?? null,
      },
    });

    revalidatePath(`/trips/${parsed.tripId}/timeline`);
    revalidatePath(`/trips/${parsed.tripId}/sections`);

    return NextResponse.json(serializeSection(section), { status: 201 });
  } catch (err) {
    if (isSectionOverlapViolation(err)) {
      return Errors.validation(
        'Section dates overlap an existing Section on this Trip (touching endpoints are allowed)',
      );
    }
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
