import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { dateKeyOfDateColumn } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { PublishIdeaForm } from '@/components/PublishIdeaForm';

interface PageProps {
  params: Promise<{ tripId: string; ideaId: string }>;
}

export default async function ConvertIdeaPage({ params }: PageProps) {
  const { tripId, ideaId } = await params;
  if (!isUuid(tripId) || !isUuid(ideaId)) notFound();

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea || idea.tripId !== tripId) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const existing = await prisma.timelineEntry.findUnique({ where: { id: ideaId, tripId } });

  const t = await getTranslations('tripIdeas');

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{t('convertTitle', { title: idea.title })}</h2>
        <Link href={`/trips/${tripId}/ideas`} className="text-soft">
          {t('backToIdeas')}
        </Link>
      </div>
      <p className="text-soft">{t('convertDescription')}</p>
      <PublishIdeaForm
        tripId={tripId}
        ideaId={ideaId}
        start={dateKeyOfDateColumn(trip.startDate)}
        end={dateKeyOfDateColumn(trip.endDate)}
        isPrivate={existing?.isPrivate ?? false}
      />
    </main>
  );
}
