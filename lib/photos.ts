// FR-3/FR-15/FR-16/FR-26/FR-28, spec-tags-links-photos, AD-4/AD-5: Photo
// upload conventions. Spec's "Always" boundary: "Photo uploads reuse
// lib/attachments.ts's MIME/size-limit conventions ... and the exact AD-5
// path shape" -- `MAX_UPLOAD_BYTES`, `buildUploadPath`, `sanitizeFilename`,
// and `formatAttachmentSize` are re-exported directly from lib/attachments.ts
// rather than redefined, so the two features can never drift on the shared
// AD-5 path shape or the 25 MB cap. Only the MIME allowlist itself differs
// -- restricted to image/jpeg | image/png (no PDF: "these are Photos, not
// generic Attachments").
export { MAX_UPLOAD_BYTES, buildUploadPath, formatAttachmentSize, sanitizeFilename, UPLOAD_ROOT } from '@/lib/attachments';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export type AllowedPhotoMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mimeType: string): mimeType is AllowedPhotoMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

// Same AD-4 owner-type subset as Tag/Link (TimelineEntry | Idea |
// ImportantInfo) -- see lib/tags.ts's TAG_OWNER_TYPES comment for why this
// is duplicated per table rather than shared.
export const PHOTO_OWNER_TYPES = ['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO'] as const;
export type PhotoOwnerType = (typeof PHOTO_OWNER_TYPES)[number];

export function isPhotoOwnerType(value: string): value is PhotoOwnerType {
  return (PHOTO_OWNER_TYPES as readonly string[]).includes(value);
}
