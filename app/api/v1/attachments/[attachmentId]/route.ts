import { unlink } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ attachmentId: string }>;
}

// FR-24/FR-25, spec-documents: single-Attachment delete -- I/O matrix:
// "Delete an Attachment -- Existing attachment -- 204, row removed, file
// removed from disk, list updates. Unknown/malformed id -> 404." Unlike the
// TimelineEntry DELETE route's cascade (which leaves files on disk per the
// spec's frozen I/O matrix, logged in deferred-work.md), this direct,
// single-Attachment delete does remove the file -- best-effort, since the DB
// row is the source of truth and a file already missing from disk (ENOENT)
// must not block the row from being deleted.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { attachmentId } = await params;
  if (!isUuid(attachmentId)) return Errors.notFound('Attachment not found');

  const existing = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!existing) return Errors.notFound('Attachment not found');

  try {
    await prisma.attachment.delete({ where: { id: attachmentId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  await unlink(existing.filePath).catch((err: NodeJS.ErrnoException) => {
    if (err?.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error(`Failed to delete attachment file at ${existing.filePath}:`, err);
    }
  });

  revalidatePath(`/trips/${existing.tripId}/documents`);
  if (existing.ownerType === 'TIMELINE_ENTRY') {
    const entry = await prisma.timelineEntry.findUnique({ where: { id: existing.ownerId } });
    if (entry) revalidatePath(entryDetailHref(existing.tripId, entry.entryType, entry.id));
  }
  if (existing.ownerType === 'IMPORTANT_INFO') {
    revalidatePath(`/trips/${existing.tripId}/important-info`);
  }

  return new NextResponse(null, { status: 204 });
}
