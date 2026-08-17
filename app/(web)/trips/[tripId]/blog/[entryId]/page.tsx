import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { BlogPostDetailPanel } from '@/components/BlogPostDetailPanel';
import type { BlogPostDTO } from '@/components/BlogPostForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

// FR-18/FR-19, spec-blog: a single Blog Post's view/edit/publish/unpublish/
// delete page -- reachable (and readable, Draft or Published alike) only
// from the Blog list, never from the generic /entries/[entryId] page
// (which explicitly 404s a BLOG_POST row -- see that page's own guard).
export default async function BlogPostDetailPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId || entry.entryType !== 'BLOG_POST') notFound();

  const post: BlogPostDTO = serializeTimelineEntry(entry);

  return (
    <main className="page">
      <Link href={`/trips/${tripId}/blog`} className="text-soft">
        Back to Blog
      </Link>
      <BlogPostDetailPanel tripId={tripId} post={post} />
    </main>
  );
}
