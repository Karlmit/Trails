import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { ideaCreateSchema } from '@/lib/validation';
import { serializeIdea } from '@/lib/serializers';
import { filterIdeas } from '@/lib/ideas';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

// FR-16/FR-17, spec-ideas: Idea CRUD, mirroring app/api/v1/sections' Route
// Handler conventions exactly (UUID checks, error handling, revalidatePath).

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return Errors.validation('tripId query parameter is required');
  if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');

  const priority = request.nextUrl.searchParams.get('priority');
  const sectionId = request.nextUrl.searchParams.get('sectionId');
  const category = request.nextUrl.searchParams.get('category');
  const weatherSuitability = request.nextUrl.searchParams.get('weatherSuitability');

  const ideas = await prisma.idea.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
  });

  // FR-16: filter by Priority/Section/Category/Weather suitability -- an
  // empty result (no match) is a normal, non-error outcome, not filtered
  // here as an error case.
  const filtered = filterIdeas(ideas.map(serializeIdea), { priority, sectionId, category, weatherSuitability });

  return NextResponse.json(filtered);
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

  let parsed;
  try {
    parsed = ideaCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const trip = await prisma.trip.findUnique({ where: { id: parsed.tripId } });
  if (!trip) return Errors.notFound('Trip not found');

  if (parsed.sectionId) {
    const section = await prisma.section.findUnique({ where: { id: parsed.sectionId } });
    if (!section || section.tripId !== parsed.tripId) {
      return Errors.validation('sectionId must reference a Section on this Trip');
    }
  }

  try {
    const idea = await prisma.idea.create({
      data: {
        tripId: parsed.tripId,
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

    revalidatePath(`/trips/${parsed.tripId}/ideas`);

    return NextResponse.json(serializeIdea(idea), { status: 201 });
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The parent Trip existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Trip not found');
    }
    throw err;
  }
}
