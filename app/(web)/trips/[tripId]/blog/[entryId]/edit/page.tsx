import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, getViewer } from '@/lib/viewer';
import { BlogPostForm, type BlogPostDTO } from '@/components/BlogPostForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

// User-reported: "I would like the blog content editor to be a full page
// experience" -- a dedicated edit page (mirroring blog/new/page.tsx),
// replacing BlogPostDetailPanel's old inline swap-to-form toggle, whose
// content editor had no room to be more than a few lines tall squeezed
// into the rest of that page's Tags/Links/Photos sections.
export default async function EditBlogPostPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  // spec-guest-access: editing a Blog Post is a User-only action, same as
  // create -- a Guest never sees an Edit link to this route, but this
  // repeats the check directly since it's a real, guessable URL.
  const viewer = await getViewer();
  if (viewer.type !== 'user') notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId || entry.entryType !== 'BLOG_POST') notFound();

  const post: BlogPostDTO = serializeTimelineEntry(entry);

  return (
    <main className="page blog-editor-page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Edit Blog Post</h2>
        <Link href={`/trips/${tripId}/blog/${entryId}`} className="text-soft">
          Back to post
        </Link>
      </div>
      <BlogPostForm tripId={tripId} mode="edit" post={post} cancelHref={`/trips/${tripId}/blog/${entryId}`} />
    </main>
  );
}
