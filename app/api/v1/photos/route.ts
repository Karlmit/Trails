import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import {
  ALLOWED_MIME_TYPES,
  buildUploadPath,
  isAllowedMimeType,
  isPhotoOwnerType,
  MAX_UPLOAD_BYTES,
  PHOTO_OWNER_TYPES,
  type PhotoOwnerType,
} from '@/lib/photos';
import { serializePhoto } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref } from '@/lib/entry-types';

// Same generous cap on the stored, unsanitized original filename as
// app/api/v1/attachments/route.ts.
const MAX_ORIGINAL_FILENAME_LENGTH = 255;

// FR-3/FR-15/FR-16/FR-26/FR-28, spec-tags-links-photos: Photo upload
// (multipart) + list, mirroring app/api/v1/attachments' Route Handler shape
// closely (same auth/validation/disk-write/revalidate conventions), with
// two differences: (1) the image-only MIME allowlist (lib/photos.ts) and
// (2) IDEA is a valid ownerType here (Attachments deliberately exclude it
// per FR-16; Photos don't). This GET/POST pair stays ordinary
// requireAuth -- never added to proxy.ts's Guest allowlist. Only
// [photoId]/file/route.ts (streaming actual bytes for an <img src>) needs
// that exception; the two Guest-eligible pages
// (app/(web)/trips/[tripId]/entries/[entryId]/page.tsx,
// blog/[entryId]/page.tsx) query Photos directly via Prisma and pass an
// already-`filterForViewer`-filtered list into PhotoGallery as
// `initialPhotos`, so PhotoGallery never needs to call this GET itself when
// rendered for a Guest.

/**
 * Resolves `tripId` from the owner row per AD-5. `entryType` is only
 * meaningful for a TIMELINE_ENTRY owner (same as
 * app/api/v1/attachments/route.ts's identically-named helper) -- Idea/
 * ImportantInfo have no entryType concept, so that field is simply omitted.
 */
async function resolveOwnerTripId(
  ownerType: PhotoOwnerType,
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

function revalidateForOwner(tripId: string, ownerType: PhotoOwnerType, ownerId: string, entryType?: string) {
  if (ownerType === 'TIMELINE_ENTRY' && entryType) {
    revalidatePath(entryDetailHref(tripId, entryType, ownerId));
    // A Cover Photo also renders as a thumbnail on BlogPostCard (spec's
    // "Scope of 'list view thumbnail'") -- the Blog list is the only
    // card-shaped list view TimelineEntry-owned Photos can affect.
    if (entryType === 'BLOG_POST') revalidatePath(`/trips/${tripId}/blog`);
  }
  if (ownerType === 'IDEA') {
    revalidatePath(`/trips/${tripId}/ideas`);
  }
  if (ownerType === 'IMPORTANT_INFO') {
    revalidatePath(`/trips/${tripId}/important-info`);
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
  if (!isPhotoOwnerType(ownerType)) {
    return Errors.validation(`ownerType must be one of: ${PHOTO_OWNER_TYPES.join(', ')}`);
  }
  if (!isUuid(ownerId)) return Errors.validation('ownerId query parameter must be a valid UUID');

  const photos = await prisma.photo.findMany({
    where: { ownerType, ownerId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(photos.map(serializePhoto));
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  // Same declared-Content-Length pre-check as app/api/v1/attachments/route.ts.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Errors.validation(`Request exceeds the maximum upload size of ${MAX_UPLOAD_BYTES} bytes`);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Errors.validation('Request body must be multipart/form-data');
  }

  const ownerTypeValue = formData.get('ownerType');
  const ownerIdValue = formData.get('ownerId');
  const fileValue = formData.get('file');
  const isPrivateValue = formData.get('isPrivate');

  if (typeof ownerTypeValue !== 'string' || !isPhotoOwnerType(ownerTypeValue)) {
    return Errors.validation(`ownerType must be one of: ${PHOTO_OWNER_TYPES.join(', ')}`);
  }
  if (typeof ownerIdValue !== 'string' || !isUuid(ownerIdValue)) {
    return Errors.validation('ownerId must be a valid UUID');
  }
  if (!(fileValue instanceof File)) {
    return Errors.validation('A file part is required');
  }

  const ownerType = ownerTypeValue;
  const ownerId = ownerIdValue;
  const file = fileValue;
  // Optional at upload time (defaults false) -- there's no separate
  // "mark private" route (unlike the dedicated primary/route.ts for
  // isPrimary), so PATCH .../[photoId] also accepts isPrivate for toggling
  // it after upload.
  const isPrivate = isPrivateValue === 'true';

  // I/O matrix: "Upload a Photo -- Valid JPEG/PNG -- 201 ... Unsupported
  // format -- Rejected before any write, 400, same as Attachments."
  if (!isAllowedMimeType(file.type)) {
    return Errors.validation(
      `Unsupported file type "${file.type || 'unknown'}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }
  if (file.size === 0) {
    return Errors.validation('Uploaded file is empty');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Errors.validation(`File exceeds the maximum upload size of ${MAX_UPLOAD_BYTES} bytes`);
  }
  if (file.name.length > MAX_ORIGINAL_FILENAME_LENGTH) {
    return Errors.validation(`Filename exceeds the maximum length of ${MAX_ORIGINAL_FILENAME_LENGTH} characters`);
  }

  const owner = await resolveOwnerTripId(ownerType, ownerId);
  if (!owner) return Errors.notFound('Owner not found');

  const filePath = buildUploadPath(owner.tripId, ownerType, ownerId, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);

  try {
    const photo = await prisma.photo.create({
      data: {
        tripId: owner.tripId,
        ownerType,
        ownerId,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
        isPrivate,
      },
    });

    revalidateForOwner(owner.tripId, ownerType, ownerId, owner.entryType);

    return NextResponse.json(serializePhoto(photo), { status: 201 });
  } catch (err) {
    // Same orphan-file cleanup as app/api/v1/attachments/route.ts: the owner
    // row existed at the lookup above but was deleted before this insert
    // committed.
    await unlink(filePath).catch(() => {});
    if (isForeignKeyViolationError(err)) return Errors.notFound('Owner not found');
    throw err;
  }
}
