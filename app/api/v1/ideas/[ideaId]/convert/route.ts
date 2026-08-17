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
  const { entryType, tripId: _ignoredTripId, ...rest } = body as Record<string, unknown>;
  if (typeof entryType !== 'string' || !isCreatableEntryType(entryType)) {
    return Errors.validation(`entryType must be one of: ${CREATABLE_ENTRY_TYPES.join(', ')}`);
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

  const trip = await prisma.trip.findUnique({ where: { id: idea.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  const rangeError = entryOutsideTripRangeError(trip, parsed.startAt as Date, parsed.endAt ?? null);
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
      // If the Idea was already converted/deleted concurrently (e.g. a
      // double-submit), this throws (Prisma's "record not found") and
      // rolls back the Entry insert above too -- never leaves a duplicate
      // Entry behind for an Idea that's already gone.
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
