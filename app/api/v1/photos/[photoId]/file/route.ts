import { readFile } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, type Viewer } from '@/lib/viewer';

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

function contentDisposition(originalFilename: string): string {
  const asciiFallback = originalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  const encoded = encodeURIComponent(originalFilename);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

// FR-3/FR-28, spec-tags-links-photos: streams a Photo's file bytes. Unlike
// every other /api/v1/** route (and unlike Attachment's own equivalent
// file route), this one GET is reachable *without* a session -- proxy.ts
// specifically allowlists this exact path shape for Guests, since Photos
// (unlike Tags/Links/Attachments) are genuinely part of the Guest-visible
// surface (spec's Intent: "Guest-facing rendering of the primary/all
// photos is ... in scope here"). A browser's own `<img src>` request for a
// Public Trip's Photo carries no auth header/cookie for an anonymous
// visitor, so the file bytes themselves -- not just the surrounding page --
// must be fetchable unauthenticated.
//
// This does NOT mean the file is served to anyone who guesses/enumerates a
// photoId: for an unauthenticated caller, this handler re-derives the exact
// same visibility this spec's Guest-eligible pages already apply, reusing
// `canViewTrip`/`filterForViewer` (lib/viewer.ts, spec-guest-access) --
// "the only place Photo Guest-visibility is decided ... no new predicate
// invented" per this spec's own Boundaries. An authenticated User is never
// subject to this check (AD-7: full access to every Trip already).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { photoId } = await params;
  if (!isUuid(photoId)) return Errors.notFound('Photo not found');

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return Errors.notFound('Photo not found');

  const user = await getUserFromApiRequest(request);
  if (!user) {
    const viewer: Viewer = { type: 'guest' };

    // Idea/ImportantInfo are structurally excluded from the Guest surface
    // entirely (AD-3) -- no page exists for a Guest to view either, so a
    // Photo owned by one is never Guest-visible regardless of Trip
    // visibility or the Photo's own isPrivate flag.
    if (photo.ownerType !== 'TIMELINE_ENTRY') {
      return Errors.notFound('Photo not found');
    }

    const [trip, entry] = await Promise.all([
      prisma.trip.findUnique({ where: { id: photo.tripId } }),
      prisma.timelineEntry.findUnique({ where: { id: photo.ownerId } }),
    ]);
    if (!trip || !entry || !canViewTrip(trip, viewer)) {
      return Errors.notFound('Photo not found');
    }
    // AD-10: Draft Blog Posts are unconditionally excluded from Guest
    // rendering, same check the Blog list/detail pages apply themselves.
    if (entry.entryType === 'BLOG_POST' && entry.publishedAt === null) {
      return Errors.notFound('Photo not found');
    }
    if (filterForViewer([entry], viewer).length === 0) {
      return Errors.notFound('Photo not found');
    }
    if (filterForViewer([photo], viewer).length === 0) {
      return Errors.notFound('Photo not found');
    }
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(photo.filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error(`Failed to read Photo ${photo.id} at ${photo.filePath}:`, err);
    }
    return Errors.notFound('File not found on disk');
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': photo.mimeType,
      'Content-Disposition': contentDisposition(photo.originalFilename),
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
      // `private` (never a shared/CDN cache): this response's visibility
      // varies per-viewer (the check above), so only the requesting
      // browser's own cache may keep a copy.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
