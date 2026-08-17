import { randomUUID } from 'node:crypto';
import path from 'node:path';

// FR-24/FR-25, spec-documents: shared upload constants/helpers used by
// app/api/v1/attachments/**. Kept DB-free and pure so they're unit-testable
// without a live Postgres, same split as lib/budget.ts's pure aggregation
// helpers vs. the Server Component that queries Prisma.

// AD-5/spec's "Always" boundary: reject unsupported formats before any
// upload completes -- validated against exactly this list.
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

// 25 MB -- a documented default, not a PRD-specified limit (spec's Code Map).
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// AD-5's mandatory upload volume mount point (docker-compose.yml's `uploads`
// volume). Never written to `public/`, never stored in Postgres.
export const UPLOAD_ROOT = '/data/uploads';

/**
 * Strips path separators and any character outside a conservative safe set
 * before the original filename is used as part of an on-disk path segment.
 * The *unsanitized* original string is still stored verbatim in the DB's
 * `originalFilename` column (for correct Content-Disposition download
 * naming) -- this function's output is only ever used for the disk path.
 */
export function sanitizeFilename(filename: string): string {
  // Strip any directory components a malicious/odd client-supplied name
  // might carry (both POSIX and Windows separators).
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const safe = cleaned.length > 0 ? cleaned : 'file';
  // Keep the path segment reasonable even for pathologically long names.
  return safe.slice(-200);
}

/**
 * AD-5's exact, mandatory path shape:
 * `/data/uploads/{trip_id}/{owner_type}/{owner_id}/{uuid}-{filename}`.
 * Generates the `{uuid}` segment itself (Node's built-in `crypto.randomUUID`,
 * the same convention as `lib/uuid.ts`'s callers elsewhere in this codebase).
 */
export function buildUploadPath(
  tripId: string,
  ownerType: string,
  ownerId: string,
  filename: string,
): string {
  const safeName = sanitizeFilename(filename);
  return path.join(UPLOAD_ROOT, tripId, ownerType, ownerId, `${randomUUID()}-${safeName}`);
}

/** Human-readable file size, shared by AttachmentList.tsx and the Documents page. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
