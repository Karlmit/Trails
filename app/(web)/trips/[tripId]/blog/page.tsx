import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, getViewer } from '@/lib/viewer';
import { BlogPostForm, type BlogPostDTO } from '@/components/BlogPostForm';
import { BlogPostCard } from '@/components/BlogPostCard';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-18-FR-20, spec-blog: Blog list + create. Deliberately reads *every*
// BLOG_POST row for this Trip -- Draft and Published alike -- unlike the
// Timeline (AD-10's unconditional Draft exclusion is specific to Timeline
// rendering): "A dedicated /trips/[tripId]/blog list page shows all posts
// (Draft and Published, since it's the User-facing management surface)."
// Same Server-Component-reads-Prisma-directly + client create-form shape as
// IdeasPage (app/(web)/trips/[tripId]/ideas/page.tsx).
//
// spec-guest-access: allowlisted for Guests -- repeats the layout's own
// canViewTrip check (defense-in-depth), and the query itself is
// viewer-branched (not "fetch everything and hide it in the UI"): a Guest's
// query never includes a Draft row at all, and `filterForViewer` strips any
// Private Published post from the result before it's ever serialized into
// the response.
export default async function BlogPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      timelineEntries: {
        where:
          viewer.type === 'guest'
            ? { entryType: 'BLOG_POST', publishedAt: { not: null } }
            : { entryType: 'BLOG_POST' },
        orderBy: { startAt: 'desc' },
      },
    },
  });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  // spec-tags-links-photos: same "one Cover Photo query per list page" shape
  // as app/(web)/trips/[tripId]/ideas/page.tsx -- filterForViewer runs first
  // so a Guest's query never leaks a Draft/Private post's own Cover Photo
  // via a stray primaryPhotoId either. That first filterForViewer pass only
  // covers the *post's* own Draft/Private state -- the Photo row has its
  // own independent isPrivate flag (a post can be public while its cover
  // photo specifically is marked Private), so a second filterForViewer pass
  // over the Photo rows themselves is required too (review-caught: this was
  // previously missing, leaking a Private cover photo's id -- though never
  // its bytes, since the file-serving route re-derives visibility itself --
  // to a Guest as a broken-image request).
  const visiblePosts = filterForViewer(trip.timelineEntries.map(serializeTimelineEntry), viewer);
  const primaryPhotosRaw = await prisma.photo.findMany({
    where: {
      ownerType: 'TIMELINE_ENTRY',
      ownerId: { in: visiblePosts.map((post) => post.id) },
      isPrimary: true,
    },
    select: { id: true, ownerId: true, isPrivate: true },
  });
  const primaryPhotos = filterForViewer(primaryPhotosRaw, viewer);
  const primaryPhotoByPostId = new Map(primaryPhotos.map((photo) => [photo.ownerId, photo.id]));

  // serializeTimelineEntry's return type carries every TimelineEntry field
  // (a strict superset of BlogPostDTO's) -- structurally assignable as-is,
  // no cast needed.
  const posts: BlogPostDTO[] = visiblePosts.map((post) => ({
    ...post,
    primaryPhotoId: primaryPhotoByPostId.get(post.id) ?? null,
  }));

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Blog</h2>
      </div>
      <p className="text-soft">
        This Trip&rsquo;s journal. A new post starts as a Draft and is never shown on the Timeline until you
        Publish it. Any User with access to this Trip can see Drafts here, same as everything else on it.
      </p>

      {viewer.type === 'user' && (
        <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
          <BlogPostForm tripId={tripId} mode="create" />
        </div>
      )}

      {posts.length === 0 ? (
        <div className="empty-state">No Blog Posts yet. Add one above.</div>
      ) : (
        <div className="stack">
          {posts.map((post) => (
            <BlogPostCard key={post.id} post={post} readOnly={viewer.type === 'guest'} />
          ))}
        </div>
      )}
    </main>
  );
}
