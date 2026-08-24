import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { tripCreateSchema } from '@/lib/validation';
import { serializeTrip } from '@/lib/serializers';

// FR-1: Trip CRUD. requireAuth (AD-7) -- any authenticated User, no
// per-Trip ownership or membership restriction (FR-31).

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const trips = await prisma.trip.findMany({ orderBy: { startDate: 'asc' } });
  return NextResponse.json(trips.map(serializeTrip));
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
    parsed = tripCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const trip = await prisma.trip.create({
    data: {
      name: parsed.name,
      destination: parsed.destination ?? null,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      timezone: parsed.timezone,
      description: parsed.description ?? null,
      coverImage: parsed.coverImage ?? null,
      visibility: parsed.visibility ?? 'PRIVATE',
      pinnedActive: parsed.pinnedActive ?? false,
    },
  });

  // AD-12: every mutation revalidates the Server Components it affects.
  revalidatePath('/');
  revalidatePath('/trips');

  return NextResponse.json(serializeTrip(trip), { status: 201 });
}
