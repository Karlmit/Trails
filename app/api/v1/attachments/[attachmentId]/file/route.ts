import { readFile } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ attachmentId: string }>;
}

/**
 * A `Content-Disposition` filename value quoted per RFC 6266 -- the ASCII
 * `filename` fallback strips anything a `"`-quoted header value can't carry
 * safely, while `filename*` (RFC 5987) carries the exact original name
 * (including any non-ASCII characters) for browsers that support it.
 */
function contentDisposition(originalFilename: string): string {
  const asciiFallback = originalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  const encoded = encodeURIComponent(originalFilename);
  // `inline` (not `attachment`) so PDFs/images preview in-browser per this
  // spec's implementation notes.
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

// FR-24, spec-documents: streams an Attachment's file bytes. I/O matrix:
// "Download/view an Attachment -- Valid attachment id, authenticated -- 200,
// file bytes streamed with correct Content-Type and original filename.
// Unauthenticated -> 401 (via existing proxy.ts gate)." proxy.ts's
// requireAuth already covers every /api/** path (AD-6/AD-7), so the
// getUserFromApiRequest check below is the same defense-in-depth every
// other Route Handler in this codebase applies, not new auth logic.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { attachmentId } = await params;
  if (!isUuid(attachmentId)) return Errors.notFound('Attachment not found');

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return Errors.notFound('Attachment not found');

  let bytes: Buffer;
  try {
    bytes = await readFile(attachment.filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      // Something other than "file genuinely missing" -- e.g. EACCES from a
      // uploads-volume permissions misconfiguration. Log it: silently
      // reporting every disk error as an identical 404 would hide a real
      // operational problem behind a message that looks like normal data
      // drift (DB row survived, file didn't).
      console.error(`Failed to read Attachment ${attachment.id} at ${attachment.filePath}:`, err);
    }
    // The DB row survived but the file itself is missing from disk (e.g. an
    // operator restored the DB volume without the uploads volume) -- a
    // clean 404 rather than a 500.
    return Errors.notFound('File not found on disk');
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': contentDisposition(attachment.originalFilename),
      // The bytes actually read, not the DB's recorded size -- if disk and
      // DB ever drift (a partial write, external volume tampering), the
      // header must describe the body actually being sent.
      'Content-Length': String(bytes.length),
      // Cheap defense-in-depth: mimeType is trusted from the client's
      // declared Content-Type at upload time (spec's accepted design, no
      // magic-byte sniffing), so tell browsers not to second-guess it into
      // a more-privileged type either.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
