import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
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
export default async function BlogPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      timelineEntries: {
        where: { entryType: 'BLOG_POST' },
        orderBy: { startAt: 'desc' },
      },
    },
  });
  if (!trip) notFound();

  // serializeTimelineEntry's return type carries every TimelineEntry field
  // (a strict superset of BlogPostDTO's) -- structurally assignable as-is,
  // no cast needed.
  const posts: BlogPostDTO[] = trip.timelineEntries.map(serializeTimelineEntry);

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Blog</h2>
      </div>
      <p className="text-soft">
        This Trip&rsquo;s journal. A new post starts as a Draft and is never shown on the Timeline until you
        Publish it. Any User with access to this Trip can see Drafts here, same as everything else on it.
      </p>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <BlogPostForm tripId={tripId} mode="create" />
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">No Blog Posts yet. Add one above.</div>
      ) : (
        <div className="stack">
          {posts.map((post) => (
            <BlogPostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </main>
  );
}
