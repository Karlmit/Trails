import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isForeignKeyViolationError, isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { dateTimeField } from '@/lib/validation';
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

// Publish an idea to the timeline using the same ID in both views.
export async function publishIdea(request: NextRequest, { params }: RouteParams, dateOnly = false) {
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
  if (dateOnly) {
    const publication = z.object({ startAt: dateTimeField, isPrivate: z.boolean().optional() }).strict().safeParse(body);
    if (!publication.success) return Errors.validation(publication.error.issues[0].message);
    body = {
      ...publication.data,
      startAt: publication.data.startAt.toISOString(),
      entryType: 'ACTIVITY',
      subtype: 'ACTIVITY_OTHER',
      title: idea.title,
      locationName: idea.locationName || idea.title,
    };
  }
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
      // Lock the idea before reading its shared content. Repeated publication
      // updates its existing timeline entry instead of creating duplicates.
      await tx.$queryRaw`SELECT id FROM ideas WHERE id = ${ideaId}::uuid FOR UPDATE`;
      const source = await tx.idea.findUniqueOrThrow({ where: { id: ideaId } });
      const data = toEntryCreateData(entryType, parsed);
      const publication = {
        ...data,
        title: source.title,
        description: source.description,
        locationName: source.locationName,
        locationAddress: source.locationAddress,
        locationLat: source.locationLat,
        locationLng: source.locationLng,
        locationMapLink: source.locationMapLink,
        expenseAmount: source.estimatedExpenseAmount,
        expenseCurrency: source.estimatedExpenseCurrency,
      };
      const previous = await tx.timelineEntry.findUnique({ where: { id: ideaId, tripId: source.tripId } });
      if (dateOnly && previous?.endAt) {
        const endAt = new Date(publication.startAt.getTime() + previous.endAt.getTime() - previous.startAt.getTime());
        const rangeError = entryOutsideTripRangeError(trip, publication.startAt, endAt, previous.startTimezone, previous.endTimezone);
        if (rangeError) return { rangeError };
        return tx.timelineEntry.update({
          where: { id: previous.id },
          data: { startAt: publication.startAt, endAt, isPrivate: publication.isPrivate },
        });
      }
      return tx.timelineEntry.upsert({
        where: { id: ideaId, tripId: source.tripId },
        create: { id: ideaId, ...publication },
        update: dateOnly
          ? { startAt: publication.startAt, endAt: null, isPrivate: publication.isPrivate }
          : publication,
      });
    });

    if ('rangeError' in entry) return Errors.validation(entry.rangeError);

    revalidatePath(`/trips/${idea.tripId}/timeline`);
    revalidatePath(`/trips/${idea.tripId}/entries/${entry.id}`);
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
