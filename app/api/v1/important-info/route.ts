import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { importantInfoCreateSchema } from '@/lib/important-info.schema';
import { serializeImportantInfo } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

// FR-26, spec-important-info: ImportantInfo CRUD, mirroring
// app/api/v1/checklists' Route Handler conventions exactly (UUID checks,
// error handling, revalidatePath). No Section association of any kind
// (spec's frozen Intent).

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return Errors.validation('tripId query parameter is required');
  if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');

  const items = await prisma.importantInfo.findMany({
    where: { tripId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json(items.map(serializeImportantInfo));
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
    parsed = importantInfoCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const trip = await prisma.trip.findUnique({ where: { id: parsed.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  // User-requested manual reordering -- new items land last, same "append"
  // semantics a plain createdAt-ordered list already had.
  const lastItem = await prisma.importantInfo.findFirst({
    where: { tripId: parsed.tripId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const nextSortOrder = (lastItem?.sortOrder ?? -1) + 1;

  try {
    const item = await prisma.importantInfo.create({
      data: {
        tripId: parsed.tripId,
        title: parsed.title,
        content: parsed.content ?? null,
        emoji: parsed.emoji ?? null,
        sortOrder: nextSortOrder,
        locationName: parsed.locationName ?? null,
        locationAddress: parsed.locationAddress ?? null,
        locationLat: parsed.locationLat ?? null,
        locationLng: parsed.locationLng ?? null,
        locationMapLink: parsed.locationMapLink ?? null,
        contactName: parsed.contactName ?? null,
        contactPhone: parsed.contactPhone ?? null,
        contactEmail: parsed.contactEmail ?? null,
        isPrivate: parsed.isPrivate ?? false,
      },
    });

    revalidatePath(`/trips/${parsed.tripId}/important-info`);

    return NextResponse.json(serializeImportantInfo(item), { status: 201 });
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
