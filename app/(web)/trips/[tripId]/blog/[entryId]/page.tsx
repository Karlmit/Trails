import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry, serializePhoto } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, getViewer } from '@/lib/viewer';
import { BlogPostDetailPanel } from '@/components/BlogPostDetailPanel';
import type { BlogPostDTO } from '@/components/BlogPostForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

// FR-18/FR-19, spec-blog: a single Blog Post's view/edit/publish/unpublish/
// delete page -- reachable (and readable, Draft or Published alike, for a
// User) only from the Blog list, never from the generic /entries/[entryId]
// page (which explicitly 404s a BLOG_POST row -- see that page's own
// guard).
//
// spec-guest-access: allowlisted for Guests -- repeats the layout's own
// canViewTrip check, plus a Guest-only Draft check (a Draft is never
// visible to a Guest, but a User's management surface always needs it, so
// this is deliberately NOT applied for viewer.type === 'user') and an
// isPrivate check via filterForViewer.
export default async function BlogPostDetailPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId || entry.entryType !== 'BLOG_POST') notFound();
  if (viewer.type === 'guest') {
    if (entry.publishedAt === null) notFound();
    if (filterForViewer([entry], viewer).length === 0) notFound();
  }

  const post: BlogPostDTO = serializeTimelineEntry(entry);

  // spec-tags-links-photos: same "query Photos, filterForViewer, pass to
  // PhotoGallery" shape as entries/[entryId]/page.tsx -- see that page's
  // identical comment for why this is required for a Guest.
  const allPhotos = await prisma.photo.findMany({
    where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });
  const photos = filterForViewer(allPhotos, viewer).map(serializePhoto);

  return (
    <main className="page">
      <Link href={`/trips/${tripId}/blog`} className="text-soft">
        Back to Blog
      </Link>
      <BlogPostDetailPanel tripId={tripId} post={post} readOnly={viewer.type === 'guest'} photos={photos} />
    </main>
  );
}
