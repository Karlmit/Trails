import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { ideaCreateSchema } from '@/lib/validation';
import { serializeIdea } from '@/lib/serializers';
import { isForeignKeyViolationError, isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

// The reverse of app/api/v1/ideas/[ideaId]/convert -- converts a Timeline
// Entry back into an Idea and deletes the Entry, atomically. Only ever
// offered for an ACTIVITY Entry (EntryDetailPanel's own "Convert to Idea"
// button is hidden for every other Entry Type) -- Stay/Transport carry
// booking-specific fields (room info, flight legs, ...) an Idea has no
// concept of, and Note/BlogPost were never candidates an Idea models in
// the first place. The request body is the same shape
// app/api/v1/ideas accepts (the caller, /entries/[entryId]/convert-to-idea's
// IdeaForm, is pre-filled with the Entry's title/location/expense) --
// Priority and Weather suitability have no Entry-side source at all, so the
// form always asks for them fresh, same as a plain new Idea.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Entry not found');

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry) return Errors.notFound('Entry not found');
  if (entry.entryType !== 'ACTIVITY') {
    return Errors.validation('Only an Activity Entry can be converted to an Idea');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }
  if (typeof body !== 'object' || body === null) {
    return Errors.validation('Request body must be a JSON object');
  }

  // `tripId` is always the converting Entry's own Trip -- never taken from
  // the caller, same guard as the Idea→Entry convert route's `tripId`
  // handling.
  const { tripId: _ignoredTripId, ...rest } = body as Record<string, unknown>;

  let parsed;
  try {
    parsed = ideaCreateSchema.parse({ tripId: entry.tripId, ...rest });
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  if (parsed.sectionId) {
    const section = await prisma.section.findUnique({ where: { id: parsed.sectionId } });
    if (!section || section.tripId !== entry.tripId) {
      return Errors.validation('sectionId must reference a Section on this Trip');
    }
  }

  try {
    const idea = await prisma.$transaction(async (tx) => {
      const created = await tx.idea.create({
        data: {
          tripId: entry.tripId,
          sectionId: parsed.sectionId ?? null,
          title: parsed.title,
          category: parsed.category ?? null,
          description: parsed.description ?? null,
          priority: parsed.priority,
          weatherSuitability: parsed.weatherSuitability,
          locationName: parsed.locationName ?? null,
          locationAddress: parsed.locationAddress ?? null,
          locationLat: parsed.locationLat ?? null,
          locationLng: parsed.locationLng ?? null,
          locationMapLink: parsed.locationMapLink ?? null,
          estimatedExpenseAmount: parsed.estimatedExpenseAmount ?? null,
          estimatedExpenseCurrency: parsed.estimatedExpenseCurrency ?? null,
        },
      });
      // AD-4's reassignment rule, mirrored in reverse (see the Idea→Entry
      // convert route's identical block): move the Entry's existing
      // Tag/Link/Photo rows onto the new Idea rather than duplicating or
      // dropping them. Same disclosed drift as that route -- a Photo's
      // filePath was baked at upload time from the old owner and is never
      // rewritten here; the DB's ownerType/ownerId stays authoritative for
      // serving/deletion regardless.
      await tx.tag.updateMany({
        where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId },
        data: { ownerType: 'IDEA', ownerId: created.id },
      });
      await tx.link.updateMany({
        where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId },
        data: { ownerType: 'IDEA', ownerId: created.id },
      });
      await tx.photo.updateMany({
        where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId },
        data: { ownerType: 'IDEA', ownerId: created.id },
      });
      // If the Entry was already deleted/converted concurrently (e.g. a
      // double-submit), this throws and rolls back the Idea insert (and
      // the reassignments) above too -- never leaves a duplicate Idea
      // behind for an Entry that's already gone.
      await tx.timelineEntry.delete({ where: { id: entryId } });
      return created;
    });

    // AD-12: revalidate both the Timeline this Entry just disappeared from
    // and the Ideas list it now renders on.
    revalidatePath(`/trips/${entry.tripId}/timeline`);
    revalidatePath(`/trips/${entry.tripId}/ideas`);

    return NextResponse.json(serializeIdea(idea), { status: 201 });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Entry not found');
    }
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
