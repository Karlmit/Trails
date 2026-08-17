import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isDateOrderValid, tripUpdateSchema } from '@/lib/validation';
import { serializeTrip } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

// FR-1/FR-2: single-Trip read/edit/delete. requireAuth (AD-7), FR-31 shared
// access -- any authenticated User may edit or delete any Trip.

interface RouteParams {
  params: Promise<{ tripId: string }>;
}

function revalidateTrip(tripId: string) {
  // AD-12: revalidate every Server Component route this mutation affects.
  revalidatePath('/');
  revalidatePath('/trips');
  revalidatePath(`/trips/${tripId}/overview`);
  revalidatePath(`/trips/${tripId}/timeline`);
  revalidatePath(`/trips/${tripId}/sections`);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { tripId } = await params;
  if (!isUuid(tripId)) return Errors.notFound('Trip not found');

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  return NextResponse.json(serializeTrip(trip));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { tripId } = await params;
  if (!isUuid(tripId)) return Errors.notFound('Trip not found');

  const existing = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!existing) return Errors.notFound('Trip not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = tripUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // tripUpdateSchema only checks endDate >= startDate when a PATCH body
  // supplies both fields -- a partial update carrying just one of them must
  // still be checked against the *other* field's current stored value so a
  // one-field PATCH can never invert the pair.
  const mergedStartDate = parsed.startDate ?? existing.startDate;
  const mergedEndDate = parsed.endDate ?? existing.endDate;
  if (!isDateOrderValid(mergedStartDate, mergedEndDate)) {
    return Errors.validation('End date must be on or after the start date');
  }

  try {
    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.destination !== undefined && { destination: parsed.destination }),
        ...(parsed.startDate !== undefined && { startDate: parsed.startDate }),
        ...(parsed.endDate !== undefined && { endDate: parsed.endDate }),
        ...(parsed.timezone !== undefined && { timezone: parsed.timezone }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.coverImage !== undefined && { coverImage: parsed.coverImage }),
        ...(parsed.visibility !== undefined && { visibility: parsed.visibility }),
      },
    });

    // Editing dates/timezone recomputes Trip Status (FR-1) -- Status is
    // derived at read time (lib/trip-status.ts), so no separate write needed.
    revalidateTrip(tripId);

    return NextResponse.json(serializeTrip(trip));
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      // Deleted by another request between our existence check and this
      // update -- from the caller's point of view, it's just not there.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { tripId } = await params;
  if (!isUuid(tripId)) return Errors.notFound('Trip not found');

  const existing = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!existing) return Errors.notFound('Trip not found');

  try {
    await prisma.trip.delete({ where: { id: tripId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      // Already deleted by another concurrent request -- deletion's end
      // state is achieved either way.
      revalidateTrip(tripId);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  revalidateTrip(tripId);

  return new NextResponse(null, { status: 204 });
}
