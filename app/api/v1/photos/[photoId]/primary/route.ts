import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializePhoto } from '@/lib/serializers';
import { isRecordNotFoundError, isSerializationFailure, isUniqueConstraintViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// FR-15, AD-4, spec-tags-links-photos, I/O matrix: "Mark a Photo primary --
// Owner already has a primary Photo -- The old primary's isPrimary flips to
// false atomically as the new one flips true -- never two primaries at
// once." A partial unique index on (owner_type, owner_id) WHERE
// is_primary = true (prisma/migrations/20260818000000_tags_links_photos)
// enforces this at the DB layer; this route performs the swap as two
// sequential statements inside one `$transaction`, unset-then-set, so the
// unique index is never violated *within* one request's transaction
// (setting the new row true before unsetting the old one would momentarily
// create two true rows, which a plain CREATE UNIQUE INDEX -- unlike a
// DEFERRABLE constraint -- rejects immediately).
//
// That guarantee does NOT extend across two concurrent PUT requests for two
// *different* Photos on the same owner (review-caught): under READ
// COMMITTED, request B's `updateMany` can start before request A's `update`
// commits, unset nothing, and then B's own `update` collides with A's
// now-committed primary -- a genuine unique-violation surfacing as an
// unhandled 500 if uncaught. Serializable isolation (same choice as the
// signup bootstrap race in app/api/v1/auth/route.ts) makes Postgres abort
// the loser outright instead of letting it partially apply and then
// collide; that abort is a serialization failure, caught below alongside
// the unique-violation shape as a defensive belt-and-suspenders (either can
// theoretically surface depending on exact timing) and turned into a clean
// 409 telling the client to refetch and retry, not a raw 500.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { photoId } = await params;
  if (!isUuid(photoId)) return Errors.notFound('Photo not found');

  const target = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!target) return Errors.notFound('Photo not found');

  try {
    const [, updated] = await prisma.$transaction(
      [
        prisma.photo.updateMany({
          where: {
            ownerType: target.ownerType,
            ownerId: target.ownerId,
            isPrimary: true,
            id: { not: photoId },
          },
          data: { isPrimary: false },
        }),
        prisma.photo.update({ where: { id: photoId }, data: { isPrimary: true } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (target.ownerType === 'TIMELINE_ENTRY') {
      const entry = await prisma.timelineEntry.findUnique({ where: { id: target.ownerId } });
      if (entry) {
        revalidatePath(entryDetailHref(target.tripId, entry.entryType, target.ownerId));
        if (entry.entryType === 'BLOG_POST') revalidatePath(`/trips/${target.tripId}/blog`);
      }
    }
    if (target.ownerType === 'IDEA') revalidatePath(`/trips/${target.tripId}/ideas`);
    if (target.ownerType === 'IMPORTANT_INFO') revalidatePath(`/trips/${target.tripId}/important-info`);

    return NextResponse.json(serializePhoto(updated));
  } catch (err) {
    if (isRecordNotFoundError(err)) return Errors.notFound('Photo not found');
    if (isSerializationFailure(err) || isUniqueConstraintViolationError(err)) {
      return Errors.conflict('This Photo’s primary status was just changed by another request. Please retry.');
    }
    throw err;
  }
}
