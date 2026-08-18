import { unlink } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError, z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializePhoto } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

const photoUpdateSchema = z.object({ isPrivate: z.boolean() }).strict();

async function revalidateForOwner(tripId: string, ownerType: string, ownerId: string) {
  if (ownerType === 'TIMELINE_ENTRY') {
    const entry = await prisma.timelineEntry.findUnique({ where: { id: ownerId } });
    if (entry) {
      revalidatePath(entryDetailHref(tripId, entry.entryType, ownerId));
      if (entry.entryType === 'BLOG_POST') revalidatePath(`/trips/${tripId}/blog`);
    }
    return;
  }
  if (ownerType === 'IDEA') {
    revalidatePath(`/trips/${tripId}/ideas`);
    return;
  }
  if (ownerType === 'IMPORTANT_INFO') {
    revalidatePath(`/trips/${tripId}/important-info`);
  }
}

// FR-3/FR-28: there's no dedicated "mark private" route (unlike
// [photoId]/primary/route.ts's dedicated atomic-swap endpoint for
// isPrimary) -- toggling isPrivate after upload goes through this same
// general PATCH, same single-schema-covers-the-one-toggleable-field pattern
// as ImportantInfo's `isPrivate` PATCH (app/api/v1/important-info/[itemId]/route.ts).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { photoId } = await params;
  if (!isUuid(photoId)) return Errors.notFound('Photo not found');

  const existing = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!existing) return Errors.notFound('Photo not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = photoUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  try {
    const photo = await prisma.photo.update({ where: { id: photoId }, data: { isPrivate: parsed.isPrivate } });

    await revalidateForOwner(existing.tripId, existing.ownerType, existing.ownerId);

    return NextResponse.json(serializePhoto(photo));
  } catch (err) {
    if (isRecordNotFoundError(err)) return Errors.notFound('Photo not found');
    throw err;
  }
}

// FR-15/FR-16/FR-26, spec-tags-links-photos, I/O matrix: "Delete the owning
// TimelineEntry/Idea/ImportantInfo ... Photo files deleted from disk
// best-effort, matching Attachment's own delete-file-on-single-item-delete
// behavior" -- this single-Photo DELETE is that same behavior, identical
// shape to app/api/v1/attachments/[attachmentId]/route.ts's DELETE.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { photoId } = await params;
  if (!isUuid(photoId)) return Errors.notFound('Photo not found');

  const existing = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!existing) return Errors.notFound('Photo not found');

  try {
    await prisma.photo.delete({ where: { id: photoId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  await unlink(existing.filePath).catch((err: NodeJS.ErrnoException) => {
    if (err?.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error(`Failed to delete photo file at ${existing.filePath}:`, err);
    }
  });

  await revalidateForOwner(existing.tripId, existing.ownerType, existing.ownerId);

  return new NextResponse(null, { status: 204 });
}
