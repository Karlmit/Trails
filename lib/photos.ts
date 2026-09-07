// FR-3/FR-15/FR-16/FR-26/FR-28, spec-tags-links-photos, AD-4/AD-5: Photo
// upload conventions. Spec's "Always" boundary: "Photo uploads reuse
// lib/attachments.ts's MIME/size-limit conventions ... and the exact AD-5
// path shape" -- `MAX_UPLOAD_BYTES`, `buildUploadPath`, `sanitizeFilename`,
// and `formatAttachmentSize` are re-exported directly from lib/attachments.ts
// rather than redefined, so the two features can never drift on the shared
// AD-5 path shape or the 25 MB cap. Only the MIME allowlist itself differs
// -- restricted to image types (no PDF: "these are Photos, not generic
// Attachments"); see ALLOWED_MIME_TYPES below.
export { MAX_UPLOAD_BYTES, buildUploadPath, formatAttachmentSize, sanitizeFilename, UPLOAD_ROOT } from '@/lib/attachments';

// User-requested URL import ("make it so anywhere I can upload a photo it's
// also possible to just post an image URL"): the allowlist grew from the
// original jpeg/png pair to include WebP and GIF. Pasting a URL is only
// useful if real-world image URLs actually work, and most modern sites (and
// every major CDN's automatic format negotiation) serve WebP -- a jpeg/png-
// only allowlist would have rejected the majority of pasted links. Both
// intake paths share this list, so a WebP file can now be picked from disk
// too; every consumer already handles it (the web renders Photos through a
// plain <img> -- see PhotoGallery's `unoptimized` comment -- and Android
// renders them through Coil, both of which decode all four formats).
// application/pdf is still deliberately absent: "these are Photos, not
// generic Attachments".
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
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
