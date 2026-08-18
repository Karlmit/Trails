import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isDateOrderValid, sectionUpdateSchema } from '@/lib/validation';
import { serializeSection } from '@/lib/serializers';
import { isRecordNotFoundError, isSectionOverlapViolation } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ sectionId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { sectionId } = await params;
  if (!isUuid(sectionId)) return Errors.notFound('Section not found');

  const existing = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!existing) return Errors.notFound('Section not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = sectionUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // sectionUpdateSchema only checks endDate >= startDate when a PATCH body
  // supplies both fields -- merge onto the existing row's current dates
  // before validating order so a one-field PATCH can't invert the pair.
  const mergedStartDate = parsed.startDate ?? existing.startDate;
  const mergedEndDate = parsed.endDate ?? existing.endDate;
  if (!isDateOrderValid(mergedStartDate, mergedEndDate)) {
    return Errors.validation('End date must be on or after the start date');
  }

  try {
    const section = await prisma.section.update({
      where: { id: sectionId },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.startDate !== undefined && { startDate: parsed.startDate }),
        ...(parsed.endDate !== undefined && { endDate: parsed.endDate }),
        ...(parsed.color !== undefined && { color: parsed.color }),
        ...(parsed.emoji !== undefined && { emoji: parsed.emoji }),
      },
    });

    revalidatePath(`/trips/${existing.tripId}/timeline`);
    revalidatePath(`/trips/${existing.tripId}/sections`);

    return NextResponse.json(serializeSection(section));
  } catch (err) {
    if (isSectionOverlapViolation(err)) {
      return Errors.validation(
        'Section dates overlap an existing Section on this Trip (touching endpoints are allowed)',
      );
    }
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Section not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { sectionId } = await params;
  if (!isUuid(sectionId)) return Errors.notFound('Section not found');

  const existing = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!existing) return Errors.notFound('Section not found');

  try {
    // Deleting a Section only removes its color band -- nothing else stores
    // a reference to it (AD-2), so nothing needs to be un-assigned.
    await prisma.section.delete({ where: { id: sectionId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidatePath(`/trips/${existing.tripId}/timeline`);
      revalidatePath(`/trips/${existing.tripId}/sections`);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  revalidatePath(`/trips/${existing.tripId}/timeline`);
  revalidatePath(`/trips/${existing.tripId}/sections`);

  return new NextResponse(null, { status: 204 });
}
