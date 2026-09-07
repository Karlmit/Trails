import { lookup } from 'node:dns/promises';
import net from 'node:net';

// User-requested: "anywhere I can upload a photo it's also possible to just
// post an image URL, that way the user does not have to actually download
// the photo first."
//
// Deliberately a *server-side import*, not a stored reference: the URL is
// fetched once, the bytes land on disk through the exact same
// `buildUploadPath` shape as a multipart upload, and a normal Photo/
// Attachment row is created. Nothing downstream can tell the difference --
// no schema column, no `<img>` pointing at a third-party host, no broken
// image when that host disappears, and the Android client's offline file
// cache (FileCacheManager) keeps working unchanged. The URL is a *transport*
// for the bytes, not a substitute for them.

/** Total budget for the remote fetch, redirects included. */
export const REMOTE_FETCH_TIMEOUT_MS = 15_000;
/** Redirect hops followed manually (each one re-validated against the SSRF guard). */
export const MAX_REMOTE_REDIRECTS = 3;

export interface RemoteFetchOptions {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  /** Fallback basename when the URL's own path carries no usable filename. */
  fallbackBasename?: string;
}

export type RemoteFetchResult =
  | { ok: true; bytes: Buffer; mimeType: string; filename: string }
  | { ok: false; message: string };

/**
 * Accepts only absolute http/https URLs. Anything else -- `file:`, `data:`,
 * `gs:`, a bare `example.com/x.jpg`, whitespace -- is rejected here rather
 * than reaching `fetch`.
 */
export function parseRemoteUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname.length === 0) return null;
  return url;
}

/**
 * SSRF guard. This endpoint lets an authenticated User make the *server*
 * issue an arbitrary outbound GET, so every address the target hostname
 * resolves to is checked against the ranges that could reach something the
 * User can't reach directly: loopback, link-local (including cloud metadata
 * at 169.254.169.254), RFC1918/CGNAT, IPv6 loopback/unique-local/link-local,
 * and IPv4-mapped IPv6 forms of all of the above.
 */
export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 0) return true;

  if (version === 4) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // "this network" / unspecified
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments / 192.0.2.0 TEST-NET
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }

  const normalized = address.toLowerCase().split('%')[0];
  // An IPv4-mapped/embedded form (::ffff:10.0.0.1, ::ffff:a00:1 is handled by
  // the prefix checks below) must be judged by its IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isBlockedAddress(mapped[1]);
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (/^f[cd]/.test(normalized)) return true; // fc00::/7 unique-local
  if (normalized.startsWith('ff')) return true; // multicast
  if (normalized.startsWith('::ffff:') || normalized.startsWith('64:ff9b:')) return true; // other v4-embedded forms
  return false;
}

/**
 * Resolves the hostname and rejects the request unless *every* address it
 * resolves to is public. A literal IP in the URL skips DNS and is checked
 * directly. (A hostname could in principle re-resolve to a blocked address
 * between this check and `fetch`'s own lookup -- accepted here: closing that
 * fully would mean pinning the resolved IP and re-implementing TLS SNI/Host
 * handling, and this endpoint is already behind authentication.)
 */
async function assertPublicHost(url: URL): Promise<{ ok: true } | { ok: false; message: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) !== 0) {
    return isBlockedAddress(host) ? { ok: false, message: BLOCKED_HOST_MESSAGE } : { ok: true };
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }
  if (addresses.length === 0) return { ok: false, message: UNREACHABLE_MESSAGE };
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    return { ok: false, message: BLOCKED_HOST_MESSAGE };
  }
  return { ok: true };
}

// Fixed strings (not interpolated) so messages/{en,sv}.json can key off them
// through lib/api-error-messages.ts's translateApiError.
export const INVALID_URL_MESSAGE = 'Enter a valid http:// or https:// URL';
export const UNREACHABLE_MESSAGE = 'That URL could not be reached';
export const BLOCKED_HOST_MESSAGE = 'That URL points to an address the server is not allowed to fetch';
export const EMPTY_REMOTE_MESSAGE = 'The file at that URL is empty';

/**
 * Magic-byte sniffing for the formats either allowlist can contain. Takes
 * priority over the response's own `Content-Type` (below) precisely because
 * a remote host is not trustworthy about it: a login wall or 404 page served
 * as `image/jpeg` must not become a "Photo" of an HTML document, and a CDN
 * serving a perfectly good PNG as `application/octet-stream` must not be
 * rejected.
 */
export function sniffMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Derives the `originalFilename` a multipart upload would have carried. The
 * URL's own last path segment is used when it looks like a filename
 * (`.../beach-hut.jpg`); query strings, trailing slashes and extensionless
 * CDN paths fall back to `<fallbackBasename>.<ext>`. The extension is always
 * corrected to match the *sniffed* type, so a `.jpg` URL that actually served
 * WebP is not stored under a lying name.
 */
export function filenameFromUrl(url: URL, mimeType: string, fallbackBasename = 'download'): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? 'bin';
  let candidate = '';
  try {
    candidate = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    candidate = url.pathname.split('/').filter(Boolean).pop() ?? '';
  }
  // Strip any existing extension -- it is re-added from the real type below.
  const stem = candidate.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim();
  const base = stem.length > 0 ? stem : fallbackBasename;
  return `${base.slice(0, 120)}.${extension}`;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Reads at most `maxBytes` (+1, so an over-cap body is detected rather than
 * silently truncated) from the response, streaming rather than buffering the
 * whole thing -- a hostile/huge URL must not be able to fill memory just
 * because it omitted or lied about `Content-Length`.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? null : buffer;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) return null;
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, total);
}

/**
 * Fetches `rawUrl` and returns bytes ready to be written by the same
 * disk-write/DB-insert tail a multipart upload uses. Never throws for a bad
 * URL, an unreachable host, a wrong content type or an oversized body --
 * those all come back as `{ ok: false, message }` so the Route Handler can
 * return them verbatim through `Errors.validation`.
 */
export async function fetchRemoteFile(rawUrl: string, options: RemoteFetchOptions): Promise<RemoteFetchResult> {
  const { allowedMimeTypes, maxBytes, fallbackBasename } = options;
  const parsed = parseRemoteUrl(rawUrl);
  if (!parsed) return { ok: false, message: INVALID_URL_MESSAGE };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    let current = parsed;
    for (let hop = 0; hop <= MAX_REMOTE_REDIRECTS; hop += 1) {
      const guard = await assertPublicHost(current);
      if (!guard.ok) return guard;

      let response: Response;
      try {
        response = await fetch(current, {
          method: 'GET',
          // Followed manually so every hop goes through assertPublicHost --
          // `redirect: 'follow'` would let a public URL bounce the server
          // into 127.0.0.1 or the cloud metadata endpoint unchecked.
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            accept: `${allowedMimeTypes.join(', ')},*/*;q=0.5`,
            'user-agent': 'Trails/1.0 (+image-url-import)',
          },
        });
      } catch {
        return { ok: false, message: UNREACHABLE_MESSAGE };
      }

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, message: UNREACHABLE_MESSAGE };
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { ok: false, message: UNREACHABLE_MESSAGE };
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          return { ok: false, message: BLOCKED_HOST_MESSAGE };
        }
        current = next;
        continue;
      }

      if (!response.ok) return { ok: false, message: UNREACHABLE_MESSAGE };

      // Cheap pre-check when the host is honest about the size, so an
      // obviously-too-big file is rejected before any bytes are read.
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        return { ok: false, message: oversizeMessage(maxBytes) };
      }

      const bytes = await readCapped(response, maxBytes).catch(() => undefined);
      if (bytes === undefined) return { ok: false, message: UNREACHABLE_MESSAGE };
      if (bytes === null) return { ok: false, message: oversizeMessage(maxBytes) };
      if (bytes.byteLength === 0) return { ok: false, message: EMPTY_REMOTE_MESSAGE };

      const headerType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const mimeType = sniffMimeType(bytes) ?? headerType;
      if (!allowedMimeTypes.includes(mimeType)) {
        return { ok: false, message: unsupportedTypeMessage(mimeType, allowedMimeTypes) };
      }

      return {
        ok: true,
        bytes,
        mimeType,
        filename: filenameFromUrl(current, mimeType, fallbackBasename),
      };
    }
    return { ok: false, message: UNREACHABLE_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}

export function oversizeMessage(maxBytes: number): string {
  return `The file at that URL exceeds the maximum upload size of ${maxBytes} bytes`;
}

export function unsupportedTypeMessage(mimeType: string, allowedMimeTypes: readonly string[]): string {
  return `That URL is not a supported file type ("${mimeType || 'unknown'}"). Allowed types: ${allowedMimeTypes.join(', ')}`;
}
