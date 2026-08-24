import { unlink } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { importantInfoUpdateSchema } from '@/lib/important-info.schema';
import { serializeImportantInfo } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

function revalidateItem(tripId: string) {
  revalidatePath(`/trips/${tripId}/important-info`);
  revalidatePath(`/trips/${tripId}/documents`);
}

// PATCH also covers the `isPrivate` toggle (spec's I/O matrix: "Single
// request flips the flag, no confirm dialog" -- same single-schema-covers-
// both-general-edits-and-toggle pattern as ChecklistItem's `checked` field
// on checklistItemUpdateSchema).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { itemId } = await params;
  if (!isUuid(itemId)) return Errors.notFound('Important Info item not found');

  const existing = await prisma.importantInfo.findUnique({ where: { id: itemId } });
  if (!existing) return Errors.notFound('Important Info item not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = importantInfoUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  try {
    const item = await prisma.importantInfo.update({
      where: { id: itemId },
      data: {
        ...(parsed.title !== undefined && { title: parsed.title }),
        ...(parsed.content !== undefined && { content: parsed.content }),
        ...(parsed.emoji !== undefined && { emoji: parsed.emoji }),
        ...(parsed.locationName !== undefined && { locationName: parsed.locationName }),
        ...(parsed.locationAddress !== undefined && { locationAddress: parsed.locationAddress }),
        ...(parsed.locationLat !== undefined && { locationLat: parsed.locationLat }),
        ...(parsed.locationLng !== undefined && { locationLng: parsed.locationLng }),
        ...(parsed.locationMapLink !== undefined && { locationMapLink: parsed.locationMapLink }),
        ...(parsed.contactName !== undefined && { contactName: parsed.contactName }),
        ...(parsed.contactPhone !== undefined && { contactPhone: parsed.contactPhone }),
        ...(parsed.contactEmail !== undefined && { contactEmail: parsed.contactEmail }),
        ...(parsed.isPrivate !== undefined && { isPrivate: parsed.isPrivate }),
      },
    });

    revalidateItem(existing.tripId);

    return NextResponse.json(serializeImportantInfo(item));
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Important Info item not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { itemId } = await params;
  if (!isUuid(itemId)) return Errors.notFound('Important Info item not found');

  const existing = await prisma.importantInfo.findUnique({ where: { id: itemId } });
  if (!existing) return Errors.notFound('Important Info item not found');

  // spec-tags-links-photos: same non-FK polymorphic cascade pattern as
  // timeline-entries'/ideas' DELETE -- Photo files are also removed,
  // best-effort (fetched before the transaction so their paths are still
  // known afterward).
  const photosToDelete = await prisma.photo.findMany({
    where: { ownerType: 'IMPORTANT_INFO', ownerId: itemId },
    select: { filePath: true },
  });

  try {
    // spec-important-info's frozen I/O matrix: "its Attachment rows are
    // deleted the same way TimelineEntry's are (no DB-level FK possible --
    // explicit delete-then-delete in the Route Handler)" -- same pattern as
    // app/api/v1/timeline-entries/[entryId]/route.ts's DELETE: rows only,
    // done atomically in one transaction with the item delete. Files
    // themselves are deliberately left on disk (same disclosed, deferred
    // cleanup as TimelineEntry's cascade -- not an oversight). Tag/Link/
    // Photo rows added to this same transaction by spec-tags-links-photos.
    await prisma.$transaction([
      prisma.attachment.deleteMany({ where: { ownerType: 'IMPORTANT_INFO', ownerId: itemId } }),
      prisma.tag.deleteMany({ where: { ownerType: 'IMPORTANT_INFO', ownerId: itemId } }),
      prisma.link.deleteMany({ where: { ownerType: 'IMPORTANT_INFO', ownerId: itemId } }),
      prisma.photo.deleteMany({ where: { ownerType: 'IMPORTANT_INFO', ownerId: itemId } }),
      prisma.importantInfo.delete({ where: { id: itemId } }),
    ]);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidateItem(existing.tripId);
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

  revalidateItem(existing.tripId);

  return new NextResponse(null, { status: 204 });
}
