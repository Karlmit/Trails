import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { PolymorphicOwnerType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ tagId: string }>;
}

// FR-15/FR-16/FR-26, spec-tags-links-photos: single-Tag delete, mirroring
// app/api/v1/attachments/[attachmentId]'s DELETE shape. Tags are
// "addable/removable/visible on the owning entity, nothing more" (spec's
// "Tags scope, disclosed") -- no PATCH/edit endpoint exists.
async function revalidateOwner(ownerType: PolymorphicOwnerType, ownerId: string) {
  if (ownerType === 'TIMELINE_ENTRY') {
    const entry = await prisma.timelineEntry.findUnique({ where: { id: ownerId } });
    if (entry) revalidatePath(entryDetailHref(entry.tripId, entry.entryType, entry.id));
    return;
  }
  if (ownerType === 'IDEA') {
    const idea = await prisma.idea.findUnique({ where: { id: ownerId } });
    if (idea) revalidatePath(`/trips/${idea.tripId}/ideas`);
    return;
  }
  if (ownerType === 'IMPORTANT_INFO') {
    const item = await prisma.importantInfo.findUnique({ where: { id: ownerId } });
    if (item) revalidatePath(`/trips/${item.tripId}/important-info`);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { tagId } = await params;
  if (!isUuid(tagId)) return Errors.notFound('Tag not found');

  const existing = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!existing) return Errors.notFound('Tag not found');

  try {
    await prisma.tag.delete({ where: { id: tagId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      await revalidateOwner(existing.ownerType, existing.ownerId);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  await revalidateOwner(existing.ownerType, existing.ownerId);

  return new NextResponse(null, { status: 204 });
}
