import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  isAllowedMimeType,
  isPhotoOwnerType,
  MAX_UPLOAD_BYTES,
  PHOTO_OWNER_TYPES,
} from '@/lib/photos';
import { MAX_UPLOAD_BYTES as ATTACHMENT_MAX_UPLOAD_BYTES } from '@/lib/attachments';

// FR-3/FR-15/FR-16/FR-26/FR-28, spec-tags-links-photos: pure helper tests.
// Spec's "Always" boundary: "Photo uploads reuse lib/attachments.ts's
// MIME/size-limit conventions ... restricted to image/jpeg/image/png only."

describe('ALLOWED_MIME_TYPES (image-only, no PDF)', () => {
  it('accepts exactly image/jpeg and image/png', () => {
    expect(ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png']);
    for (const type of ALLOWED_MIME_TYPES) {
      expect(isAllowedMimeType(type)).toBe(true);
    }
  });

  it('rejects application/pdf (unlike Attachments -- Photos are image-only)', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(false);
  });

  it('rejects an unsupported/empty format', () => {
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
    expect(isAllowedMimeType('')).toBe(false);
  });
});

describe('MAX_UPLOAD_BYTES (reused from lib/attachments.ts, not redefined)', () => {
  it('is the exact same 25 MB constant as Attachment uploads', () => {
    expect(MAX_UPLOAD_BYTES).toBe(ATTACHMENT_MAX_UPLOAD_BYTES);
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('PHOTO_OWNER_TYPES / isPhotoOwnerType', () => {
  it('is exactly the AD-4 owner-type subset (TIMELINE_ENTRY | IDEA | IMPORTANT_INFO)', () => {
    expect(PHOTO_OWNER_TYPES).toEqual(['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO']);
  });

  it('rejects an unknown owner type', () => {
    expect(isPhotoOwnerType('CHECKLIST')).toBe(false);
  });
});
