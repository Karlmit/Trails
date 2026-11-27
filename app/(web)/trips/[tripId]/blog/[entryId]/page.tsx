import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry, serializePhoto } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, getViewer } from '@/lib/viewer';
import { BlogViewTracker } from '@/components/BlogViewTracker';
import { BlogPostDetailPanel } from '@/components/BlogPostDetailPanel';
import { NotificationOptInCard } from '@/components/NotificationOptInCard';
import { getPushPublicKey } from '@/lib/push-config';
import type { BlogPostDTO } from '@/components/BlogPostForm';
import styles from './post-navigation.module.css';

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

  const t = await getTranslations('tripBlog');
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
  const visibleBlogPosts = {
    tripId,
    entryType: 'BLOG_POST',
    ...(viewer.type === 'guest' && { publishedAt: { not: null }, isPrivate: false }),
  } as const;
  // The ID breaks ties when several posts share a date.
  const [allPhotos, older, newer] = await Promise.all([
    prisma.photo.findMany({
      where: { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, mimeType: { startsWith: 'image/' } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.timelineEntry.findFirst({
      where: {
        ...visibleBlogPosts,
        OR: [{ startAt: { lt: entry.startAt } }, { startAt: entry.startAt, id: { lt: entry.id } }],
      },
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      select: { id: true, title: true },
    }),
    prisma.timelineEntry.findFirst({
      where: {
        ...visibleBlogPosts,
        OR: [{ startAt: { gt: entry.startAt } }, { startAt: entry.startAt, id: { gt: entry.id } }],
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true },
    }),
  ]);
  const photos = filterForViewer(allPhotos, viewer).map(serializePhoto);

  return (
    <main className="page blog-reader-page">
      <Link href={`/trips/${tripId}/blog`} className="text-soft">
        {t('backToBlog')}
      </Link>
      {/* spec-push-notifications: the same ask as the Blog list carries, on
          the page a shared link actually lands on -- a reader sent straight
          to one post would otherwise never be offered notifications at all.
          Same component, same localStorage dismissal, so saying "Not now"
          on either surface silences both. */}
      <NotificationOptInCard publicKey={getPushPublicKey()} />
      {entry.publishedAt !== null && <BlogViewTracker entryId={entry.id} />}
      <BlogPostDetailPanel tripId={tripId} post={post} readOnly={viewer.type === 'guest'} photos={photos} />
      {(older || newer) && (
        <nav className={styles.navigation} aria-labelledby="more-blog-posts">
          <h2 className={styles.heading} id="more-blog-posts">{t('morePosts')}</h2>
          <div className={styles.links}>
            {older && (
              <Link className={styles.link} href={`/trips/${tripId}/blog/${older.id}`}>
                <span className={styles.direction}>{t('olderPost')}</span>
                <strong>{older.title}</strong>
              </Link>
            )}
            {newer && (
              <Link className={styles.link} href={`/trips/${tripId}/blog/${newer.id}`}>
                <span className={styles.direction}>{t('newerPost')}</span>
                <strong>{newer.title}</strong>
              </Link>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
