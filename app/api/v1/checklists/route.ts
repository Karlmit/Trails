import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { checklistCreateSchema } from '@/lib/validation';
import { serializeChecklist, serializeChecklistItem } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { filterChecklistsForUser } from '@/lib/checklist-access';

// FR-21, spec-checklists: Checklist CRUD, mirroring app/api/v1/sections'
// Route Handler conventions exactly (UUID checks, error handling,
// revalidatePath). No Section association of any kind (spec's frozen
// Intent) -- unlike Sections, there is no overlap rule to enforce here.

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return Errors.validation('tripId query parameter is required');
  if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');

  const checklists = await prisma.checklist.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });

  // A private Checklist is only visible to the User who created it (see
  // lib/checklist-access.ts) -- filtered here, not in the schema `where`,
  // so this stays the one place that rule is expressed, same convention as
  // lib/viewer.ts's filterForViewer.
  const visible = filterChecklistsForUser(checklists, user);

  return NextResponse.json(
    visible.map((checklist) => ({
      ...serializeChecklist(checklist),
      items: checklist.items.map(serializeChecklistItem),
    })),
  );
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
    parsed = checklistCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const trip = await prisma.trip.findUnique({ where: { id: parsed.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  try {
    const checklist = await prisma.checklist.create({
      data: {
        tripId: parsed.tripId,
        title: parsed.title,
        emoji: parsed.emoji ?? null,
        isPrivate: parsed.isPrivate ?? false,
        createdByUserId: user.id,
      },
    });

    revalidatePath(`/trips/${parsed.tripId}/checklists`);

    return NextResponse.json({ ...serializeChecklist(checklist), items: [] }, { status: 201 });
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
