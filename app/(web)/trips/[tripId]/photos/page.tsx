import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BlogMediaGallery, type BlogMediaItem } from '@/components/BlogMediaGallery';
import { prisma } from '@/lib/prisma';
import { canViewTrip, getViewer } from '@/lib/viewer';
import { isUuid } from '@/lib/uuid';

export default async function TripPhotosPage({ params }: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const [viewer, trip, t] = await Promise.all([
    getViewer(),
    prisma.trip.findUnique({ where: { id: tripId }, select: { visibility: true } }),
    getTranslations('tripPhotos'),
  ]);
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const publicOnly = viewer.type === 'guest' ? { isPrivate: false } : {};
  const posts = await prisma.timelineEntry.findMany({
    where: { tripId, entryType: 'BLOG_POST', publishedAt: { not: null }, ...publicOnly },
    orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true },
  });
  const media = posts.length === 0 ? [] : await prisma.photo.findMany({
    where: {
      tripId,
      ownerType: 'TIMELINE_ENTRY',
      ownerId: { in: posts.map(({ id }) => id) },
      OR: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }],
      ...publicOnly,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, ownerId: true, mimeType: true, originalFilename: true },
  });

  const byPost = new Map<string, BlogMediaItem[]>();
  for (const item of media) {
    const group = byPost.get(item.ownerId) ?? [];
    group.push({
      id: item.id,
      src: `/api/v1/photos/${item.id}/file`,
      filename: item.originalFilename,
      kind: item.mimeType.startsWith('video/') ? 'video' : 'photo',
    });
    byPost.set(item.ownerId, group);
  }

  const groups = posts.flatMap((post) => {
    const items = byPost.get(post.id);
    return items ? [{ id: post.id, title: post.title, items }] : [];
  });

  return (
    <main className="page-wide">
      <h2>{t('heading')}</h2>
      {groups.length > 0 ? (
        <BlogMediaGallery groups={groups} tripId={tripId} />
      ) : (
        <p className="empty-state">{t('empty')}</p>
      )}
    </main>
  );
}
