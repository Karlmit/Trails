import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { PolymorphicOwnerType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, buildUploadPath, isAllowedMimeType } from '@/lib/attachments';
import { serializeAttachment } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { entryDetailHref, timelineVisibleEntryWhere } from '@/lib/entry-types';

// A generous cap on the *stored, unsanitized* original filename -- well
// above any real filename, just enough to keep it out of Content-Disposition
// header-size territory (see the check at the point of use below).
const MAX_ORIGINAL_FILENAME_LENGTH = 255;

// FR-24/FR-25, spec-documents: Attachment upload (multipart) + list, mirroring
// app/api/v1/checklists' Route Handler conventions (auth check, isUuid,
// Errors helper, revalidatePath) as closely as a file-upload endpoint can.
//
// AD-4: `ownerType` is `TimelineEntry | Idea | ImportantInfo` in the
// architecture -- `TIMELINE_ENTRY` and `IMPORTANT_INFO` are both real enum
// members (Idea never gets Attachments per FR-16). spec-important-info added
// the `IMPORTANT_INFO` branch below exactly as spec-documents' Intent
// predicted: a new enum member + one new branch in resolveOwnerTripId, no
// other Attachment code changes.
const ATTACHMENT_OWNER_TYPES = ['TIMELINE_ENTRY', 'IMPORTANT_INFO'] as const;

function isAttachmentOwnerType(value: string): value is PolymorphicOwnerType {
  return (ATTACHMENT_OWNER_TYPES as readonly string[]).includes(value);
}

/**
 * Resolves `tripId` from the owner row per AD-5 ("the upload handler
 * resolves trip_id via the owner lookup before writing"). `entryType` is
 * only meaningful for a TIMELINE_ENTRY owner (used by revalidateForOwner
 * below to pick the right Entry detail path) -- ImportantInfo has no
 * entryType concept at all, so that field is simply omitted for it rather
 * than the function growing an owner-type-specific return shape.
 */
async function resolveOwnerTripId(
  ownerType: PolymorphicOwnerType,
  ownerId: string,
): Promise<{ tripId: string; entryType?: string } | null> {
  if (ownerType === 'TIMELINE_ENTRY') {
    const entry = await prisma.timelineEntry.findUnique({ where: { id: ownerId } });
    if (!entry) return null;
    return { tripId: entry.tripId, entryType: entry.entryType };
  }
  if (ownerType === 'IMPORTANT_INFO') {
    const item = await prisma.importantInfo.findUnique({ where: { id: ownerId } });
    if (!item) return null;
    return { tripId: item.tripId };
  }
  return null;
}

function revalidateForOwner(tripId: string, ownerType: PolymorphicOwnerType, ownerId: string, entryType?: string) {
  revalidatePath(`/trips/${tripId}/documents`);
  if (ownerType === 'TIMELINE_ENTRY' && entryType) {
    revalidatePath(entryDetailHref(tripId, entryType, ownerId));
  }
  if (ownerType === 'IMPORTANT_INFO') {
    revalidatePath(`/trips/${tripId}/important-info`);
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const tripId = request.nextUrl.searchParams.get('tripId');
  const ownerType = request.nextUrl.searchParams.get('ownerType');
  const ownerId = request.nextUrl.searchParams.get('ownerId');

  // Two supported query shapes: `?tripId=` (Documents' Trip-wide
  // aggregation, FR-25) or `?ownerType=&ownerId=` (a single Entry's
  // Attachment list, including a Draft Blog Post's own editing surface --
  // deliberately unfiltered below, since a Draft's owner must still see and
  // manage its Attachments before publishing).
  if (tripId) {
    if (!isUuid(tripId)) return Errors.validation('tripId query parameter must be a valid UUID');
    // AD-10: this is a stable API surface (NFR: "the API surface should be
    // treated as a stable contract" for a future Android client), so it
    // must not leak a Draft Blog Post's Attachments any more than the
    // Documents page itself does (app/(web)/trips/[tripId]/documents/page.tsx
    // applies the same timelineVisibleEntryWhere() filter for the same
    // reason).
    const visibleEntryIds = (
      await prisma.timelineEntry.findMany({
        where: { tripId, ...timelineVisibleEntryWhere() },
        select: { id: true },
      })
    ).map((entry) => entry.id);
    const attachments = await prisma.attachment.findMany({
      where: {
        tripId,
        OR: [
          { ownerType: { not: 'TIMELINE_ENTRY' } },
          { ownerType: 'TIMELINE_ENTRY', ownerId: { in: visibleEntryIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(attachments.map(serializeAttachment));
  }

  if (!ownerType || !ownerId) {
    return Errors.validation(
      'Either a tripId query parameter, or both ownerType and ownerId query parameters, are required',
    );
  }
  if (!isAttachmentOwnerType(ownerType)) {
    return Errors.validation(`ownerType must be one of: ${ATTACHMENT_OWNER_TYPES.join(', ')}`);
  }
  if (!isUuid(ownerId)) return Errors.validation('ownerId query parameter must be a valid UUID');

  const attachments = await prisma.attachment.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(attachments.map(serializeAttachment));
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  // `request.formData()` below buffers the entire multipart body into
  // memory before this handler can inspect `file.size` -- checking a
  // declared Content-Length first rejects an obviously-oversized request
  // before that buffering happens, rather than after. This is a mitigation,
  // not a hard guarantee (a client can omit Content-Length or use chunked
  // transfer-encoding), consistent with this app's stated small
  // self-hosted/trusted-user threat model -- the same risk tolerance
  // already applied to e.g. no login rate-limiting (see deferred-work.md).
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

  if (typeof ownerTypeValue !== 'string' || !isAttachmentOwnerType(ownerTypeValue)) {
    return Errors.validation(`ownerType must be one of: ${ATTACHMENT_OWNER_TYPES.join(', ')}`);
  }
  if (typeof ownerIdValue !== 'string' || !isUuid(ownerIdValue)) {
    return Errors.validation('ownerId must be a valid UUID');
  }
  // I/O matrix: "Upload with no file part -- Empty/malformed multipart body
  // -- 400." A missing `file` field, or one that isn't an actual File part,
  // both land here.
  if (!(fileValue instanceof File)) {
    return Errors.validation('A file part is required');
  }

  const ownerType = ownerTypeValue;
  const ownerId = ownerIdValue;
  const file = fileValue;

  // I/O matrix: "Upload an unsupported format -- Rejected before any write,
  // 400." MIME type is checked before anything touches disk.
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
  // `originalFilename` is stored verbatim (unsanitized, unlike the on-disk
  // path segment) and later echoed into the Content-Disposition download
  // header -- an unbounded name risks an oversized response header on
  // download for a file that uploaded successfully. Reject before any write,
  // same as every other format/size check above.
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
    const attachment = await prisma.attachment.create({
      data: {
        tripId: owner.tripId,
        ownerType,
        ownerId,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
      },
    });

    revalidateForOwner(owner.tripId, ownerType, ownerId, owner.entryType);

    return NextResponse.json(serializeAttachment(attachment), { status: 201 });
  } catch (err) {
    // The owner row existed at the lookup above but was deleted before this
    // insert committed -- clean up the file we just wrote rather than
    // leaving an orphan with no DB row pointing at it.
    await unlink(filePath).catch(() => {});
    if (isForeignKeyViolationError(err)) return Errors.notFound('Owner not found');
    throw err;
  }
}
