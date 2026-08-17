import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

// FR-19, AD-1, AD-10: the one and only way `published_at` ever changes --
// mirrors app/api/v1/auth's PUT/DELETE-on-one-route convention (there:
// PUT signup / DELETE logout; here: PUT publish / DELETE unpublish), one
// Route Handler file discriminated by HTTP method rather than a
// `POST .../publish` + `POST .../unpublish` pair.
//   PUT    /api/v1/timeline-entries/[entryId]/publish -- sets publishedAt = now()
//   DELETE /api/v1/timeline-entries/[entryId]/publish -- clears publishedAt
//
// Neither action is exposed by the normal create/edit form (Boundaries:
// "published_at is never client-settable through the normal create/edit
// form") -- blogPostCreateSchema/blogPostUpdateSchema (lib/entry-types/
// blog-post.schema.ts) don't even have a `publishedAt` field, so this route
// is the *only* code path that writes the column.
function revalidateBlogPost(tripId: string, entryId: string) {
  // AD-12: publishing/unpublishing changes what the Timeline shows (AD-10),
  // and always changes the Blog list's Draft/Published badge for this post.
  revalidatePath(`/trips/${tripId}/timeline`);
  revalidatePath(`/trips/${tripId}/blog`);
  revalidatePath(`/trips/${tripId}/blog/${entryId}`);
}

async function loadBlogPost(entryId: string) {
  if (!isUuid(entryId)) return null;
  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  // Publish/unpublish only ever makes sense for a Blog Post -- every other
  // Entry Type has no `publishedAt` concept at all (AD-1: the column is
  // real and shared, but only FR-19 ever sets it).
  if (!entry || entry.entryType !== 'BLOG_POST') return null;
  return entry;
}

/** PUT — Publish. Sets `publishedAt = now()`, even if already Published. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  const existing = await loadBlogPost(entryId);
  if (!existing) return Errors.notFound('Blog Post not found');

  try {
    const entry = await prisma.timelineEntry.update({
      where: { id: entryId },
      data: { publishedAt: new Date() },
    });

    revalidateBlogPost(existing.tripId, entryId);

    return NextResponse.json(serializeTimelineEntry(entry));
  } catch (err) {
    if (isRecordNotFoundError(err)) return Errors.notFound('Blog Post not found');
    throw err;
  }
}

/** DELETE — Unpublish. Clears `publishedAt` back to `NULL` (Draft again). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId } = await params;
  const existing = await loadBlogPost(entryId);
  if (!existing) return Errors.notFound('Blog Post not found');

  try {
    await prisma.timelineEntry.update({
      where: { id: entryId },
      data: { publishedAt: null },
    });

    revalidateBlogPost(existing.tripId, entryId);

    // 204, matching every other DELETE in this API (Section, Trip, Entry) --
    // the caller (BlogPostDetailPanel) only checks response.ok and
    // router.refresh()s, never reads the body.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isRecordNotFoundError(err)) return Errors.notFound('Blog Post not found');
    throw err;
  }
}
