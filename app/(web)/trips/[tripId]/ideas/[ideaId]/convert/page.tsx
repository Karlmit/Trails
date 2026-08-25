import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { serializeIdea } from '@/lib/serializers';
import { dateKeyOfDateColumn } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { EntryForm } from '@/components/EntryForm';

interface PageProps {
  params: Promise<{ tripId: string; ideaId: string }>;
}

// FR-17, spec-ideas: a thin wrapper around EntryForm (reused, not a second
// create form -- Boundaries: "Always") with the Idea's title and estimated
// expense pre-filled but editable, submitting to the convert endpoint
// instead of the plain create endpoint. The user still picks the Entry
// Type and confirms date/time here, same as any other new Entry.
export default async function ConvertIdeaPage({ params }: PageProps) {
  const { tripId, ideaId } = await params;
  if (!isUuid(tripId) || !isUuid(ideaId)) notFound();

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea || idea.tripId !== tripId) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const dto = serializeIdea(idea);

  const t = await getTranslations('tripIdeas');

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{t('convertTitle', { title: dto.title })}</h2>
        <Link href={`/trips/${tripId}/ideas`} className="text-soft">
          {t('backToIdeas')}
        </Link>
      </div>
      <p className="text-soft">{t('convertDescription')}</p>
      <EntryForm
        tripId={tripId}
        mode="create"
        tripTimezone={trip.timezone}
        tripStartDate={dateKeyOfDateColumn(trip.startDate)}
        initialValues={{
          title: dto.title,
          locationName: dto.locationName,
          locationAddress: dto.locationAddress,
          locationMapLink: dto.locationMapLink,
          expenseAmount: dto.estimatedExpenseAmount,
          expenseCurrency: dto.estimatedExpenseCurrency,
        }}
        apiUrl={`/api/v1/ideas/${ideaId}/convert`}
      />
    </main>
  );
}
