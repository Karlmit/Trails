import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isLinkOwnerType, linkCreateSchema, LINK_OWNER_TYPES } from '@/lib/links';
import { serializeLink } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

// FR-15/FR-16/FR-26, spec-tags-links-photos: Link CRUD, identical shape to
// app/api/v1/tags/route.ts (see that file's comments for the shared
// reasoning -- no Guest-facing surface, no FK on ownerId).

async function resolveOwnerTripId(
  ownerType: (typeof LINK_OWNER_TYPES)[number],
  ownerId: string,
): Promise<{ tripId: string; entryType?: string } | null> {
  if (ownerType === 'TIMELINE_ENTRY') {
    const entry = await prisma.timelineEntry.findUnique({ where: { id: ownerId } });
    if (!entry) return null;
    return { tripId: entry.tripId, entryType: entry.entryType };
  }
  if (ownerType === 'IDEA') {
    const idea = await prisma.idea.findUnique({ where: { id: ownerId } });
    if (!idea) return null;
    return { tripId: idea.tripId };
  }
  if (ownerType === 'IMPORTANT_INFO') {
    const item = await prisma.importantInfo.findUnique({ where: { id: ownerId } });
    if (!item) return null;
    return { tripId: item.tripId };
  }
  return null;
}

function revalidateForOwner(
  ownerType: (typeof LINK_OWNER_TYPES)[number],
  ownerId: string,
  owner: { tripId: string; entryType?: string },
) {
  if (ownerType === 'TIMELINE_ENTRY' && owner.entryType) {
    revalidatePath(entryDetailHref(owner.tripId, owner.entryType, ownerId));
  }
  if (ownerType === 'IDEA') {
    revalidatePath(`/trips/${owner.tripId}/ideas`);
  }
  if (ownerType === 'IMPORTANT_INFO') {
    revalidatePath(`/trips/${owner.tripId}/important-info`);
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const ownerType = request.nextUrl.searchParams.get('ownerType');
  const ownerId = request.nextUrl.searchParams.get('ownerId');
  if (!ownerType || !ownerId) {
    return Errors.validation('Both ownerType and ownerId query parameters are required');
  }
  if (!isLinkOwnerType(ownerType)) {
    return Errors.validation(`ownerType must be one of: ${LINK_OWNER_TYPES.join(', ')}`);
  }
  if (!isUuid(ownerId)) return Errors.validation('ownerId query parameter must be a valid UUID');

  const links = await prisma.link.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(links.map(serializeLink));
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
    parsed = linkCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const owner = await resolveOwnerTripId(parsed.ownerType, parsed.ownerId);
  if (!owner) return Errors.notFound('Owner not found');

  const link = await prisma.link.create({
    data: {
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      url: parsed.url,
      label: parsed.label ?? null,
    },
  });

  revalidateForOwner(parsed.ownerType, parsed.ownerId, owner);

  return NextResponse.json(serializeLink(link), { status: 201 });
}
