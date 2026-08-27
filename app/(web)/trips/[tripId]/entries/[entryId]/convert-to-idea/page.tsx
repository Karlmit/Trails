import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { serializeIdea, serializeTimelineEntry } from '@/lib/serializers';
import { distinctCategories } from '@/lib/ideas';
import { entryEndpointDateKey } from '@/lib/trip-status';
import { sectionIndexForDateKey } from '@/lib/timeline';
import { isUuid } from '@/lib/uuid';
import { ConvertEntryToIdeaForm } from '@/components/ConvertEntryToIdeaForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

// The reverse of ideas/[ideaId]/convert -- a thin wrapper around IdeaForm
// (reused, not a second create form) with the Activity's title/location/
// estimated expense pre-filled but editable, submitting to the Entry→Idea
// convert endpoint instead of the plain create endpoint. Only ever linked
// to from an ACTIVITY Entry's own detail page (EntryDetailPanel hides the
// "Convert to Idea" button for every other Entry Type) -- entering this URL
// directly for a Stay/Transport/Note/BlogPost 404s rather than silently
// converting a type Ideas were never meant to model.
export default async function ConvertEntryToIdeaPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId || entry.entryType !== 'ACTIVITY') notFound();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { sections: { orderBy: { startDate: 'asc' } }, ideas: { orderBy: { createdAt: 'asc' } } },
  });
  if (!trip) notFound();

  const dto = serializeTimelineEntry(entry);

  // Best-effort Section carry-over: an Entry has no stored sectionId of its
  // own (AD-2 -- membership is always derived from startAt), so this
  // derives the Section its own start date currently falls in, the same
  // containment check the Timeline itself renders by (sectionIndexForDateKey).
  // Still just a pre-fill -- the form's own Section picker is fully
  // editable before submitting.
  const sectionIndex = sectionIndexForDateKey(entryEndpointDateKey(entry.startAt, entry.startTimezone), trip.sections);
  const sectionId = sectionIndex !== null ? trip.sections[sectionIndex].id : null;

  const categoryOptions = distinctCategories(trip.ideas.map(serializeIdea));

  const t = await getTranslations('tripEntries');

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{t('convertToIdeaTitle', { title: dto.title })}</h2>
        <Link href={`/trips/${tripId}/entries/${entryId}`} className="text-soft">
          {t('backToEntryLink')}
        </Link>
      </div>
      <p className="text-soft">{t('convertToIdeaDescription')}</p>
      <ConvertEntryToIdeaForm
        tripId={tripId}
        entryId={entryId}
        sections={trip.sections.map((section) => ({ id: section.id, name: section.name }))}
        categoryOptions={categoryOptions}
        initialValues={{
          title: dto.title,
          description: dto.description,
          sectionId,
          locationName: dto.locationName,
          locationAddress: dto.locationAddress,
          locationMapLink: dto.locationMapLink,
          estimatedExpenseAmount: dto.expenseAmount,
          estimatedExpenseCurrency: dto.expenseCurrency,
        }}
      />
    </main>
  );
}
