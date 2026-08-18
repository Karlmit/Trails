import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { clearOrphanedExpenseDependents } from '@/lib/entry-types/shared-fields.schema';
import {
  applyEntryLegTimezones,
  CREATABLE_ENTRY_TYPES,
  CREATE_SCHEMAS,
  entryOutsideTripRangeError,
  isCreatableEntryType,
  timelineVisibleEntryWhere,
  toEntryCreateData,
  type ParsedEntryFields,
} from '@/lib/entry-types';

// FR-11-FR-15, AD-1: TimelineEntry CRUD, mirroring app/api/v1/sections'
// Route Handler conventions exactly (UUID checks, error handling,
// revalidatePath for the Timeline). AD-1: `entry_type` selects exactly one
// Zod schema (lib/entry-types/*.schema.ts) that validates the whole body,
// shared fields and type_details alike -- no shape is inferred here.

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return Errors.validation('tripId query parameter is required');
  if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');

  const entries = await prisma.timelineEntry.findMany({
    // AD-10: a Draft Blog Post (`publishedAt IS NULL`) is unconditionally
    // excluded from this list, for every authenticated User -- not just
    // Guests. `timelineVisibleEntryWhere()` is the one shared predicate for
    // this (see its definition), also used by the Timeline Server
    // Component, so the two read paths can't drift.
    where: { tripId, ...timelineVisibleEntryWhere() },
    orderBy: { startAt: 'asc' },
  });
  return NextResponse.json(entries.map(serializeTimelineEntry));
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  if (typeof body !== 'object' || body === null) {
    return Errors.validation('Request body must be a JSON object');
  }

  // `entryType` is the schema discriminator (AD-1), not itself a field any
  // per-type schema validates -- pulled out before parsing so it can't trip
  // Note's `.strict()` shape on an unrecognized key.
  const { entryType, ...rest } = body as Record<string, unknown>;
  if (typeof entryType !== 'string' || !isCreatableEntryType(entryType)) {
    return Errors.validation(`entryType must be one of: ${CREATABLE_ENTRY_TYPES.join(', ')}`);
  }

  let parsed: ParsedEntryFields;
  try {
    parsed = CREATE_SCHEMAS[entryType].parse(rest) as ParsedEntryFields;
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const legError = applyEntryLegTimezones(entryType, parsed);
  if (legError) return Errors.validation(legError);

  const tripId = parsed.tripId as string;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  const rangeError = entryOutsideTripRangeError(
    trip,
    parsed.startAt as Date,
    parsed.endAt ?? null,
    parsed.startTimezone ?? null,
    parsed.endTimezone ?? null,
  );
  if (rangeError) return Errors.validation(rangeError);

  // FR-22: an Expense amount+currency pair passed `hasExpensePair` above
  // (schema-level refine) if both were absent -- but a stray payment
  // status/note supplied with no pair at all would otherwise be stored
  // orphaned from the start. Clears it defensively before the insert.
  clearOrphanedExpenseDependents(parsed, {
    expenseAmount: parsed.expenseAmount ?? null,
    expenseCurrency: parsed.expenseCurrency ?? null,
  });

  try {
    const entry = await prisma.timelineEntry.create({
      data: toEntryCreateData(entryType, parsed),
    });

    // AD-12: revalidate the Timeline this Entry now renders on (a Draft
    // Blog Post never actually changes what the Timeline shows, per AD-10,
    // but revalidating unconditionally here matches every other type and
    // costs nothing). A Blog Post also needs its own list page revalidated.
    revalidatePath(`/trips/${tripId}/timeline`);
    if (entryType === 'BLOG_POST') revalidatePath(`/trips/${tripId}/blog`);

    return NextResponse.json(serializeTimelineEntry(entry), { status: 201 });
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
