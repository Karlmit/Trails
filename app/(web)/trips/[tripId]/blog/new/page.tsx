import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { dateKeyOfDateColumn } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, getViewer } from '@/lib/viewer';
import { BlogPostForm } from '@/components/BlogPostForm';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// User-reported: "I would like the blog content editor to be a full page
// experience" -- a dedicated create page, same shape as
// entries/new/page.tsx's own FAB-launched create page, rather than the
// small inline form this used to be at the top of the Blog list.
export default async function NewBlogPostPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  // spec-guest-access: creating a Blog Post is a User-only action -- the
  // Blog list page never renders a link to this route for a Guest, but
  // this repeats that check directly since it's a real, guessable URL.
  const viewer = await getViewer();
  if (viewer.type !== 'user') notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  return (
    <main className="page blog-editor-page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>New Blog Post</h2>
        <Link href={`/trips/${tripId}/blog`} className="text-soft">
          Back to Blog
        </Link>
      </div>
      <BlogPostForm
        tripId={tripId}
        mode="create"
        tripStartDate={dateKeyOfDateColumn(trip.startDate)}
        cancelHref={`/trips/${tripId}/blog`}
      />
    </main>
  );
}
