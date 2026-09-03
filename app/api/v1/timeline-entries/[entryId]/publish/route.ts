import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { sendBlogPostNotification } from '@/lib/push';

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

// spec-push-notifications: publishing is the one and only trigger for a
// new-post notification, so the fan-out hangs off this route rather than
// off the create/edit path -- a Draft never notifies anyone, and neither
// does editing an already-published post.
//
// Guarded by `notifiedAt` (not `publishedAt`): unpublish + re-publish is a
// normal editorial action here (DELETE below clears `publishedAt`), and it
// must not notify everyone a second time about the same post. The stamp is
// claimed with a conditional UPDATE rather than a read-then-write, so two
// concurrent publishes of the same post can only ever produce one fan-out
// -- whichever request loses the race gets `count: 0` and sends nothing.
//
// Every failure here is swallowed: the User's publish already succeeded,
// and a Push Service being slow or down must not turn it into a 500 (see
// lib/push.ts's header for why this is awaited inline at all). `notifiedAt`
// is deliberately claimed *before* sending, so a crash mid-fan-out can
// never re-notify the subscribers who already received it.
async function notifySubscribersOnce(entryId: string) {
  try {
    const claimed = await prisma.timelineEntry.updateMany({
      where: { id: entryId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const entry = await prisma.timelineEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        tripId: true,
        title: true,
        entryType: true,
        isPrivate: true,
        publishedAt: true,
        trip: { select: { id: true, name: true, visibility: true } },
      },
    });
    if (!entry) return;

    await sendBlogPostNotification(entry, entry.trip);
  } catch (err) {
    console.error('[push] Blog Post notification fan-out failed', err);
  }
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

    await notifySubscribersOnce(entryId);

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
    // spec-push-notifications: `notifiedAt` is deliberately NOT cleared
    // here. Unpublishing is a correction, not a reset -- re-publishing
    // afterwards must not push the same post to everyone a second time.
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
