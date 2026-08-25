import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { dateKeyOfDateColumn } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { EntryForm } from '@/components/EntryForm';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-11-FR-15: the FAB's launch point -- a separate create page, not inline
// Timeline editing (this spec's one exception to "Timeline is view-only").
export default async function NewEntryPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const t = await getTranslations('tripEntries');

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{t('addEntryHeading')}</h2>
        <Link href={`/trips/${tripId}/timeline`} className="text-soft">
          {t('backToTimelineLink')}
        </Link>
      </div>
      <p className="text-soft">{t('addEntryDescription')}</p>
      <EntryForm
        tripId={tripId}
        mode="create"
        tripTimezone={trip.timezone}
        tripStartDate={dateKeyOfDateColumn(trip.startDate)}
      />
    </main>
  );
}
