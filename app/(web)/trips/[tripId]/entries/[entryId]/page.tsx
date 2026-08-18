import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, getViewer } from '@/lib/viewer';
import { EntryDetailPanel } from '@/components/EntryDetailPanel';
import type { CreatableEntryType } from '@/components/EntryForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

// spec-guest-access: allowlisted for Guests (proxy.ts's GUEST_ELIGIBLE_PATH)
// -- repeats the layout's own canViewTrip check (defense-in-depth), plus an
// entry-level isPrivate check via filterForViewer so a Guest who
// guesses/bookmarks a Private Entry's URL directly still 404s, even on an
// otherwise-Public Trip.
export default async function EntryDetailPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId) notFound();
  // spec-blog: a Blog Post has its own dedicated view/edit/publish/delete
  // page (/trips/[tripId]/blog/[entryId]) with its own Draft/Published
  // affordances -- never this generic Entry detail page, which has neither.
  if (entry.entryType === 'BLOG_POST') notFound();
  if (filterForViewer([entry], viewer).length === 0) notFound();

  const dto = {
    ...serializeTimelineEntry(entry),
    entryType: entry.entryType as CreatableEntryType,
    typeDetails: (entry.typeDetails as Record<string, unknown> | null) ?? {},
  };

  return (
    <main className="page">
      <Link href={`/trips/${tripId}/timeline`} className="text-soft">
        Back to Timeline
      </Link>
      <EntryDetailPanel tripId={tripId} entry={dto} readOnly={viewer.type === 'guest'} />
    </main>
  );
}
