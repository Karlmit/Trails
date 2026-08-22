import { unlink } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { hasEstimatedExpensePair, ideaUpdateSchema } from '@/lib/validation';
import { serializeIdea } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ ideaId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { ideaId } = await params;
  if (!isUuid(ideaId)) return Errors.notFound('Idea not found');

  const existing = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!existing) return Errors.notFound('Idea not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = ideaUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // Merge-before-checking, same pattern as Section/TimelineEntry PATCH: a
  // one-field PATCH (e.g. only `estimatedExpenseAmount`) must be checked
  // against the Idea's other, already-stored value, not treated as if the
  // omitted field were being cleared.
  const mergedAmount =
    parsed.estimatedExpenseAmount !== undefined
      ? parsed.estimatedExpenseAmount
      : existing.estimatedExpenseAmount !== null
        ? Number(existing.estimatedExpenseAmount)
        : null;
  const mergedCurrency =
    parsed.estimatedExpenseCurrency !== undefined
      ? parsed.estimatedExpenseCurrency
      : existing.estimatedExpenseCurrency;
  if (!hasEstimatedExpensePair({ estimatedExpenseAmount: mergedAmount, estimatedExpenseCurrency: mergedCurrency })) {
    return Errors.validation('Estimated expense requires both an amount and a currency');
  }

  if (parsed.sectionId) {
    const section = await prisma.section.findUnique({ where: { id: parsed.sectionId } });
    if (!section || section.tripId !== existing.tripId) {
      return Errors.validation('sectionId must reference a Section on this Trip');
    }
  }

  try {
    const idea = await prisma.idea.update({
      where: { id: ideaId },
      data: {
        ...(parsed.sectionId !== undefined && { sectionId: parsed.sectionId }),
        ...(parsed.title !== undefined && { title: parsed.title }),
        ...(parsed.category !== undefined && { category: parsed.category }),
        ...(parsed.priority !== undefined && { priority: parsed.priority }),
        ...(parsed.weatherSuitability !== undefined && { weatherSuitability: parsed.weatherSuitability }),
        ...(parsed.weatherTags !== undefined && { weatherTags: parsed.weatherTags }),
        ...(parsed.locationName !== undefined && { locationName: parsed.locationName }),
        ...(parsed.locationAddress !== undefined && { locationAddress: parsed.locationAddress }),
        ...(parsed.locationLat !== undefined && { locationLat: parsed.locationLat }),
        ...(parsed.locationLng !== undefined && { locationLng: parsed.locationLng }),
        ...(parsed.locationMapLink !== undefined && { locationMapLink: parsed.locationMapLink }),
        ...(parsed.estimatedExpenseAmount !== undefined && {
          estimatedExpenseAmount: parsed.estimatedExpenseAmount,
        }),
        ...(parsed.estimatedExpenseCurrency !== undefined && {
          estimatedExpenseCurrency: parsed.estimatedExpenseCurrency,
        }),
      },
    });

    revalidatePath(`/trips/${existing.tripId}/ideas`);

    return NextResponse.json(serializeIdea(idea));
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Idea not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { ideaId } = await params;
  if (!isUuid(ideaId)) return Errors.notFound('Idea not found');

  const existing = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!existing) return Errors.notFound('Idea not found');

  // spec-tags-links-photos, Boundaries: "the existing convert Route Handler
  // needs this added ... Idea never gets Attachments (Idea never gets
  // Attachments today) but now needs the same Tag/Link/Photo cleanup
  // Entry/ImportantInfo already have for Attachments." Idea has no
  // Attachment rows to clean up (FR-16 still excludes it), but does now
  // have Tag/Link/Photo -- same non-FK polymorphic cascade pattern as
  // app/api/v1/timeline-entries/[entryId]/route.ts's DELETE, including the
  // same "Photo files also removed, best-effort" behavior.
  const photosToDelete = await prisma.photo.findMany({
    where: { ownerType: 'IDEA', ownerId: ideaId },
    select: { filePath: true },
  });

  try {
    await prisma.$transaction([
      prisma.tag.deleteMany({ where: { ownerType: 'IDEA', ownerId: ideaId } }),
      prisma.link.deleteMany({ where: { ownerType: 'IDEA', ownerId: ideaId } }),
      prisma.photo.deleteMany({ where: { ownerType: 'IDEA', ownerId: ideaId } }),
      prisma.idea.delete({ where: { id: ideaId } }),
    ]);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidatePath(`/trips/${existing.tripId}/ideas`);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  await Promise.all(
    photosToDelete.map((photo) =>
      unlink(photo.filePath).catch((err: NodeJS.ErrnoException) => {
        if (err?.code !== 'ENOENT') {
          console.error(`Failed to delete photo file at ${photo.filePath}:`, err);
        }
      }),
    ),
  );

  revalidatePath(`/trips/${existing.tripId}/ideas`);

  return new NextResponse(null, { status: 204 });
}
