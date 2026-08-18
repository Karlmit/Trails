import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isTagOwnerType, tagCreateSchema, TAG_OWNER_TYPES } from '@/lib/tags';
import { serializeTag } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

// FR-15/FR-16/FR-26, spec-tags-links-photos: Tag CRUD, mirroring
// app/api/v1/attachments' polymorphic-owner conventions (auth check, isUuid,
// Errors helper, revalidatePath). No Guest-facing surface (spec's "Never"
// boundary) -- these routes stay ordinary requireAuth, same as Attachments,
// never added to proxy.ts's Guest allowlist.

/** Resolves `tripId` from the owner row, for revalidatePath targeting. */
async function resolveOwnerTripId(
  ownerType: (typeof TAG_OWNER_TYPES)[number],
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
  ownerType: (typeof TAG_OWNER_TYPES)[number],
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
  if (!isTagOwnerType(ownerType)) {
    return Errors.validation(`ownerType must be one of: ${TAG_OWNER_TYPES.join(', ')}`);
  }
  if (!isUuid(ownerId)) return Errors.validation('ownerId query parameter must be a valid UUID');

  const tags = await prisma.tag.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(tags.map(serializeTag));
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
    parsed = tagCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // Tag.ownerId is a non-FK polymorphic reference (AD-4 -- the owning table
  // varies with ownerType, so it can't be a declared Prisma relation/FK).
  // There is no unique/FK constraint to race against, so an existence check
  // here (rather than a try/catch around the insert) is the only way to
  // 404 a deleted-out-from-under-us owner.
  const owner = await resolveOwnerTripId(parsed.ownerType, parsed.ownerId);
  if (!owner) return Errors.notFound('Owner not found');

  const tag = await prisma.tag.create({
    data: { ownerType: parsed.ownerType, ownerId: parsed.ownerId, text: parsed.text },
  });

  revalidateForOwner(parsed.ownerType, parsed.ownerId, owner);

  return NextResponse.json(serializeTag(tag), { status: 201 });
}
