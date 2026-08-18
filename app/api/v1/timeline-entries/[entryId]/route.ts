import { unlink } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { clearOrphanedExpenseDependents, hasExpensePair } from '@/lib/entry-types/shared-fields.schema';
import {
  UPDATE_SCHEMAS,
  entryOutsideTripRangeError,
  isCreatableEntryType,
  mergedDateOrderError,
  toEntryUpdateData,
  type ParsedEntryFields,
} from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

function revalidateEntry(tripId: string, entryId: string, entryType?: string) {
  // AD-12: revalidate every Server Component route this mutation affects.
  revalidatePath(`/trips/${tripId}/timeline`);
  if (entryType === 'BLOG_POST') {
    // Blog Posts render on their own dedicated pages, never
    // /entries/[entryId] (see entries/[entryId]/page.tsx's explicit guard).
    revalidatePath(`/trips/${tripId}/blog`);
    revalidatePath(`/trips/${tripId}/blog/${entryId}`);
  } else {
    revalidatePath(`/trips/${tripId}/entries/${entryId}`);
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Entry not found');

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  // AD-7: any authenticated User has full access to Trip-owned content --
  // this single-entry GET intentionally returns a Draft Blog Post too (its
  // own management surface, /trips/[tripId]/blog, needs to read one by id).
  // AD-10's unconditional Draft exclusion is specifically about *Timeline
  // rendering*, not every read path -- see timelineVisibleEntryWhere.
  if (!entry || !isCreatableEntryType(entry.entryType)) {
    return Errors.notFound('Entry not found');
  }

  return NextResponse.json(serializeTimelineEntry(entry));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Entry not found');

  const existing = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  // Editing a Draft (or Published) Blog Post's title/content/date goes
  // through this same PATCH -- `publishedAt` itself is never a field on
  // blogPostUpdateSchema (AD-10, Boundaries: "published_at is never
  // client-settable through the normal create/edit form"), so it can only
  // ever change via the dedicated publish/unpublish route.
  if (!existing || !isCreatableEntryType(existing.entryType)) {
    return Errors.notFound('Entry not found');
  }
  const entryType = existing.entryType;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }
  if (typeof body !== 'object' || body === null) {
    return Errors.validation('Request body must be a JSON object');
  }

  // Entry Type is fixed at creation (AD-1's discriminator, not an editable
  // field) -- tripId is likewise never reassigned via PATCH.
  const { entryType: _ignoredEntryType, tripId: _ignoredTripId, ...rest } = body as Record<
    string,
    unknown
  >;

  let parsed: ParsedEntryFields;
  try {
    parsed = UPDATE_SCHEMAS[entryType].parse(rest) as ParsedEntryFields;
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // Merge-before-checking-order, same pattern as Section/Trip PATCH so a
  // one-field PATCH can never invert the pair.
  const mergedStartAt = parsed.startAt ?? existing.startAt;
  const mergedEndAt = parsed.endAt !== undefined ? parsed.endAt : existing.endAt;
  const orderError = mergedDateOrderError(entryType, mergedStartAt, mergedEndAt);
  if (orderError) return Errors.validation(orderError);

  // The merged start/end must still fall within the parent Trip's own date
  // range -- otherwise it 200s but then never renders anywhere on the
  // Timeline (layoutTimelineEntries defensively drops it).
  const trip = await prisma.trip.findUnique({ where: { id: existing.tripId } });
  if (!trip) return Errors.notFound('Trip not found');
  const rangeError = entryOutsideTripRangeError(trip, mergedStartAt, mergedEndAt);
  if (rangeError) return Errors.validation(rangeError);

  // Same merge for the Expense pair (FR-22): amount and currency must
  // still travel together after the merge, not just within this PATCH body.
  const mergedAmount =
    parsed.expenseAmount !== undefined
      ? parsed.expenseAmount
      : existing.expenseAmount !== null
        ? Number(existing.expenseAmount)
        : null;
  const mergedCurrency =
    parsed.expenseCurrency !== undefined ? parsed.expenseCurrency : existing.expenseCurrency;
  if (!hasExpensePair({ expenseAmount: mergedAmount, expenseCurrency: mergedCurrency })) {
    return Errors.validation('Expense requires both an amount and a currency');
  }
  // Clearing the Expense pair (merged amount+currency both null) must also
  // clear its dependent payment status/note, not leave them orphaned
  // pointing at an Expense that no longer exists.
  clearOrphanedExpenseDependents(parsed, { expenseAmount: mergedAmount, expenseCurrency: mergedCurrency });

  try {
    const entry = await prisma.timelineEntry.update({
      where: { id: entryId },
      data: toEntryUpdateData(parsed),
    });

    revalidateEntry(existing.tripId, entryId, entryType);

    return NextResponse.json(serializeTimelineEntry(entry));
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Entry not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Entry not found');

  const existing = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  // Deleting a Blog Post (Draft or Published) goes through this same
  // endpoint -- same guard as GET/PATCH above, applied consistently across
  // every read/write path.
  if (!existing || !isCreatableEntryType(existing.entryType)) {
    return Errors.notFound('Entry not found');
  }

  // spec-tags-links-photos, I/O matrix: "Delete the owning TimelineEntry ...
  // Owner has Tags, Links, and Photos -- All three types of rows deleted
  // (Photo files deleted from disk best-effort, matching Attachment's own
  // delete-file-on-single-item-delete behavior -- NOT the 'orphan on
  // owner-delete' behavior, since that was specific to bulk owner deletion
  // cascades)." Unlike Attachment's cascade (rows only, files deliberately
  // left on disk), Photo's cascade here also removes the files -- fetched
  // before the transaction so their paths are still known afterward.
  const photosToDelete = await prisma.photo.findMany({
    where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId },
    select: { filePath: true },
  });

  try {
    // spec-documents (FR-24/FR-25), frozen I/O matrix: "Entry delete
    // cascades -- Attachment rows gone too (rows only; files remain on
    // disk, logged as deferred cleanup)." Attachment.ownerId isn't a
    // declarable Prisma relation (AD-4's owner_type is polymorphic), so this
    // explicit deleteMany + the Entry delete are the cascade, done
    // atomically in one transaction. The orphaned files this leaves behind
    // are a disclosed, deliberate deferral -- see deferred-work.md -- not an
    // oversight; deleting them too would go beyond what the frozen matrix
    // calls for. Tag/Link/Photo rows are the same non-FK polymorphic
    // pattern (AD-4), added to this same transaction by spec-tags-links-photos.
    await prisma.$transaction([
      prisma.attachment.deleteMany({ where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId } }),
      prisma.tag.deleteMany({ where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId } }),
      prisma.link.deleteMany({ where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId } }),
      prisma.photo.deleteMany({ where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId } }),
      prisma.timelineEntry.delete({ where: { id: entryId } }),
    ]);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidateEntry(existing.tripId, entryId, existing.entryType);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  // Best-effort, same as the single-Photo DELETE route -- a file already
  // missing from disk (ENOENT) never blocks the response.
  await Promise.all(
    photosToDelete.map((photo) =>
      unlink(photo.filePath).catch((err: NodeJS.ErrnoException) => {
        if (err?.code !== 'ENOENT') {
          console.error(`Failed to delete photo file at ${photo.filePath}:`, err);
        }
      }),
    ),
  );

  revalidateEntry(existing.tripId, entryId, existing.entryType);
  revalidatePath(`/trips/${existing.tripId}/documents`);

  return new NextResponse(null, { status: 204 });
}
