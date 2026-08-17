import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildUploadPath,
  formatAttachmentSize,
  isAllowedMimeType,
  sanitizeFilename,
  UPLOAD_ROOT,
} from '@/lib/attachments';

// FR-24, spec-documents: "unit tests covering the I/O matrix" for the pure,
// DB-free helpers -- MIME allowlist, filename sanitization, and AD-5's exact
// upload path shape. Same split as lib/budget.ts's pure aggregation helpers
// vs. the Route Handler/page that actually touches Prisma/disk.

describe('isAllowedMimeType (I/O matrix: reject unsupported formats)', () => {
  it('accepts exactly the documented allowlist', () => {
    expect(ALLOWED_MIME_TYPES).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
    for (const type of ALLOWED_MIME_TYPES) {
      expect(isAllowedMimeType(type)).toBe(true);
    }
  });

  it('rejects an unsupported format (e.g. an .exe\'s MIME type)', () => {
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
  });

  it('rejects an empty/missing MIME type', () => {
    expect(isAllowedMimeType('')).toBe(false);
  });
});

describe('MAX_UPLOAD_BYTES', () => {
  it('is documented as 25 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators from a client-supplied filename', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('..\\..\\windows\\system32\\evil.dll')).not.toContain('\\');
  });

  it('replaces unsafe characters but keeps a recognizable name', () => {
    expect(sanitizeFilename('my ticket (final)!.pdf')).toBe('my_ticket__final__.pdf');
  });

  it('keeps a plain safe filename untouched', () => {
    expect(sanitizeFilename('passport-scan.png')).toBe('passport-scan.png');
  });

  it('falls back to a non-empty name when sanitization would empty the string', () => {
    expect(sanitizeFilename('///')).toBe('file');
  });
});

describe('buildUploadPath (AD-5: exact mandatory path shape)', () => {
  it('matches /data/uploads/{tripId}/{ownerType}/{ownerId}/{uuid}-{filename}', () => {
    const tripId = '11111111-1111-4111-8111-111111111111';
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const result = buildUploadPath(tripId, 'TIMELINE_ENTRY', ownerId, 'ticket.pdf');

    const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const expected = new RegExp(
      `^${UPLOAD_ROOT}/${tripId}/TIMELINE_ENTRY/${ownerId}/${uuidPattern}-ticket\\.pdf$`,
    );
    expect(result).toMatch(expected);
  });

  it('generates a fresh uuid on every call, so two uploads of the same filename never collide', () => {
    const tripId = '11111111-1111-4111-8111-111111111111';
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const first = buildUploadPath(tripId, 'TIMELINE_ENTRY', ownerId, 'ticket.pdf');
    const second = buildUploadPath(tripId, 'TIMELINE_ENTRY', ownerId, 'ticket.pdf');
    expect(first).not.toBe(second);
  });

  it('sanitizes the filename segment even though the DB stores the original unsanitized', () => {
    const tripId = '11111111-1111-4111-8111-111111111111';
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const result = buildUploadPath(tripId, 'TIMELINE_ENTRY', ownerId, '../../evil name?.pdf');
    expect(result.startsWith(`${UPLOAD_ROOT}/${tripId}/TIMELINE_ENTRY/${ownerId}/`)).toBe(true);
    expect(result.split('/')).toHaveLength(7);
  });
});

describe('formatAttachmentSize', () => {
  it('formats bytes, kilobytes, and megabytes readably', () => {
    expect(formatAttachmentSize(500)).toBe('500 B');
    expect(formatAttachmentSize(2048)).toBe('2.0 KB');
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
