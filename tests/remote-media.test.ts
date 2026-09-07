import { describe, expect, it } from 'vitest';
import {
  filenameFromUrl,
  isBlockedAddress,
  parseRemoteUrl,
  sniffMimeType,
} from '@/lib/remote-media';
import { ALLOWED_MIME_TYPES as PHOTO_MIME_TYPES } from '@/lib/photos';
import { ALLOWED_MIME_TYPES as ATTACHMENT_MIME_TYPES } from '@/lib/attachments';

// User-requested URL import ("anywhere I can upload a photo it's also
// possible to just post an image URL"). Pure-helper tests only -- the
// network path itself (fetchRemoteFile) is exercised through the
// photos/attachments route integration tests.

describe('parseRemoteUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(parseRemoteUrl('https://example.com/a.jpg')?.href).toBe('https://example.com/a.jpg');
    expect(parseRemoteUrl('http://example.com/a.jpg')?.href).toBe('http://example.com/a.jpg');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(parseRemoteUrl('  https://example.com/a.jpg\n')?.href).toBe('https://example.com/a.jpg');
  });

  it('rejects every non-http(s) scheme a paste could carry', () => {
    for (const raw of [
      'file:///etc/passwd',
      'data:image/png;base64,AAAA',
      'ftp://example.com/a.jpg',
      'javascript:alert(1)',
      'gs://bucket/a.jpg',
    ]) {
      expect(parseRemoteUrl(raw)).toBeNull();
    }
  });

  it('rejects a bare hostname, a relative path and an empty string', () => {
    expect(parseRemoteUrl('example.com/a.jpg')).toBeNull();
    expect(parseRemoteUrl('/a.jpg')).toBeNull();
    expect(parseRemoteUrl('   ')).toBeNull();
  });
});

describe('isBlockedAddress (SSRF guard)', () => {
  it('blocks loopback, link-local/cloud metadata, RFC1918 and CGNAT', () => {
    for (const address of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '169.254.169.254',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '100.64.0.1',
      '255.255.255.255',
      '224.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('blocks IPv6 loopback, unique-local, link-local and v4-mapped forms', () => {
    for (const address of ['::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '172.15.0.1', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('blocks anything that is not an IP at all', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('sniffMimeType', () => {
  it('recognises every format either allowlist contains', () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMimeType(Buffer.from('GIF89a....', 'latin1'))).toBe('image/gif');
    expect(sniffMimeType(Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1')]))).toBe('image/webp');
    expect(sniffMimeType(Buffer.from('%PDF-1.7', 'latin1'))).toBe('application/pdf');
  });

  it('returns null for an HTML error page a host might serve as image/jpeg', () => {
    expect(sniffMimeType(Buffer.from('<!DOCTYPE html><html>Not found', 'latin1'))).toBeNull();
  });

  it('every sniffable image type is an accepted Photo type, and PDF is not', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect((PHOTO_MIME_TYPES as readonly string[]).includes(type), type).toBe(true);
    }
    expect((PHOTO_MIME_TYPES as readonly string[]).includes('application/pdf')).toBe(false);
    expect((ATTACHMENT_MIME_TYPES as readonly string[]).includes('application/pdf')).toBe(true);
  });
});

describe('filenameFromUrl', () => {
  it('keeps the URL\'s own basename and corrects the extension to the real type', () => {
    expect(filenameFromUrl(new URL('https://example.com/photos/beach-hut.jpg'), 'image/jpeg')).toBe('beach-hut.jpg');
    // A ".jpg" URL that actually served WebP must not be stored under a lying name.
    expect(filenameFromUrl(new URL('https://example.com/photos/beach-hut.jpg'), 'image/webp')).toBe('beach-hut.webp');
  });

  it('ignores the query string', () => {
    expect(filenameFromUrl(new URL('https://cdn.example.com/x/hut.png?w=800&auto=format'), 'image/png')).toBe('hut.png');
  });

  it('falls back for an extensionless or empty CDN path', () => {
    expect(filenameFromUrl(new URL('https://images.example.com/photo-1234567890'), 'image/jpeg', 'photo')).toBe('photo-1234567890.jpg');
    expect(filenameFromUrl(new URL('https://example.com/'), 'image/png', 'photo')).toBe('photo.png');
  });

  it('decodes a percent-encoded basename', () => {
    expect(filenameFromUrl(new URL('https://example.com/Kina%20resa.jpg'), 'image/jpeg')).toBe('Kina resa.jpg');
  });

  it('caps a pathologically long basename', () => {
    const name = filenameFromUrl(new URL(`https://example.com/${'a'.repeat(500)}.jpg`), 'image/jpeg');
    expect(name.length).toBeLessThanOrEqual(124);
  });
});
