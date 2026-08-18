import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isForeignKeyViolationError, isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { clearOrphanedExpenseDependents } from '@/lib/entry-types/shared-fields.schema';
import {
  applyEntryLegTimezones,
  CREATABLE_ENTRY_TYPES,
  CREATE_SCHEMAS,
  entryOutsideTripRangeError,
  isCreatableEntryType,
  toEntryCreateData,
  type ParsedEntryFields,
} from '@/lib/entry-types';

interface RouteParams {
  params: Promise<{ ideaId: string }>;
}

// FR-17, spec-ideas: converts an Idea into a TimelineEntry and deletes the
// Idea, atomically. The request body is the *same* Entry-creation shape
// app/api/v1/timeline-entries accepts (AD-1: one Zod schema per entryType,
// reused here rather than redefined) -- the caller (the /ideas/[id]/convert
// page's EntryForm, pre-filled with the Idea's title/estimated expense) is
// free to edit every field, including adding the confirmed date/time and
// booking details the Idea never had. Validation runs to completion
// *before* anything is written, and the create+delete happen inside one
// transaction, so an Entry-validation failure (e.g. missing required date)
// never touches the Idea (Acceptance Criteria: "the Idea still exists").
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { ideaId } = await params;
  if (!isUuid(ideaId)) return Errors.notFound('Idea not found');

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return Errors.notFound('Idea not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }
  if (typeof body !== 'object' || body === null) {
    return Errors.validation('Request body must be a JSON object');
  }

  // `entryType` is the schema discriminator (AD-1); `tripId` is always the
  // converting Idea's own Trip -- never taken from the caller, so a stray
  // or stale value in the (pre-filled) form body can't retarget the new
  // Entry at a different Trip than the Idea it's replacing.
  //
  // spec-blog: BLOG_POST joined CREATABLE_ENTRY_TYPES (it's now creatable/
  // editable through the timeline-entries API), but converting an Idea into
  // a Blog Post is outside this spec's scope -- never offered by the
  // conversion UI (components/EntryForm.tsx's own picker still only lists
  // the original 4 types) and not part of FR-17's design. Excluded here
  // explicitly so this endpoint's accepted set stays exactly what it was.
  const CONVERT_ENTRY_TYPES = CREATABLE_ENTRY_TYPES.filter((type) => type !== 'BLOG_POST');
  const { entryType, tripId: _ignoredTripId, ...rest } = body as Record<string, unknown>;
  if (
    typeof entryType !== 'string' ||
    !isCreatableEntryType(entryType) ||
    entryType === 'BLOG_POST'
  ) {
    return Errors.validation(`entryType must be one of: ${CONVERT_ENTRY_TYPES.join(', ')}`);
  }

  let parsed: ParsedEntryFields;
  try {
    parsed = CREATE_SCHEMAS[entryType].parse({ tripId: idea.tripId, ...rest }) as ParsedEntryFields;
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const legError = applyEntryLegTimezones(entryType, parsed);
  if (legError) return Errors.validation(legError);

  const trip = await prisma.trip.findUnique({ where: { id: idea.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  const rangeError = entryOutsideTripRangeError(
    trip,
    parsed.startAt as Date,
    parsed.endAt ?? null,
    parsed.startTimezone ?? null,
    parsed.endTimezone ?? null,
  );
  if (rangeError) return Errors.validation(rangeError);

  // Same defensive clear as timeline-entries POST (FR-22).
  clearOrphanedExpenseDependents(parsed, {
    expenseAmount: parsed.expenseAmount ?? null,
    expenseCurrency: parsed.expenseCurrency ?? null,
  });

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.timelineEntry.create({
        data: toEntryCreateData(entryType, parsed),
      });
      // AD-4's literal rule: "Converting an Idea into a TimelineEntry (FR-17)
      // reassigns its existing Tag/Photo/Link rows' owner_type/owner_id to
      // the new TimelineEntry -- never duplicates them." Reassigned in the
      // same transaction as the create+delete below, so a failure here rolls
      // back the whole conversion (never a half-reassigned state).
      await tx.tag.updateMany({
        where: { ownerType: 'IDEA', ownerId: ideaId },
        data: { ownerType: 'TIMELINE_ENTRY', ownerId: created.id },
      });
      await tx.link.updateMany({
        where: { ownerType: 'IDEA', ownerId: ideaId },
        data: { ownerType: 'TIMELINE_ENTRY', ownerId: created.id },
      });
      // Disclosed drift (review-caught): this rewrites the DB row's
      // ownerType/ownerId, but a Photo's `filePath` was already baked at
      // upload time from the *old* owner (AD-5's path shape embeds
      // owner_type/owner_id in the directory) and is never rewritten here --
      // rewriting/moving the physical file on every conversion would be
      // disproportionate for what is otherwise inert drift. The stored
      // filePath column stays authoritative for serving/deletion regardless
      // (verified live), so this is permanently a cosmetic mismatch between
      // AD-5's literal path convention and the DB's ownership record for any
      // converted Photo -- never a functional or data-integrity issue.
      await tx.photo.updateMany({
        where: { ownerType: 'IDEA', ownerId: ideaId },
        data: { ownerType: 'TIMELINE_ENTRY', ownerId: created.id },
      });
      // If the Idea was already converted/deleted concurrently (e.g. a
      // double-submit), this throws (Prisma's "record not found") and
      // rolls back the Entry insert (and the reassignments) above too --
      // never leaves a duplicate Entry behind for an Idea that's already
      // gone.
      await tx.idea.delete({ where: { id: ideaId } });
      return created;
    });

    // AD-12: revalidate both the Timeline this Entry now renders on and the
    // Ideas list it just disappeared from.
    revalidatePath(`/trips/${idea.tripId}/timeline`);
    revalidatePath(`/trips/${idea.tripId}/ideas`);

    return NextResponse.json(serializeTimelineEntry(entry), { status: 201 });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Idea not found');
    }
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
