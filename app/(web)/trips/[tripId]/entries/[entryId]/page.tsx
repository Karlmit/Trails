import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTimelineEntry } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { EntryDetailPanel } from '@/components/EntryDetailPanel';
import type { CreatableEntryType } from '@/components/EntryForm';

interface PageProps {
  params: Promise<{ tripId: string; entryId: string }>;
}

export default async function EntryDetailPage({ params }: PageProps) {
  const { tripId, entryId } = await params;
  if (!isUuid(tripId) || !isUuid(entryId)) notFound();

  const entry = await prisma.timelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tripId !== tripId) notFound();
  // Blog Post rows aren't manageable through this spec's view/edit page yet
  // (FR-18-20 is a later spec) -- guard defensively even though no create
  // path in this spec ever produces one.
  if (entry.entryType === 'BLOG_POST') notFound();

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
      <EntryDetailPanel tripId={tripId} entry={dto} />
    </main>
  );
}
