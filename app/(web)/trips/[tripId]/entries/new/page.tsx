import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
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

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Add Entry</h2>
        <Link href={`/trips/${tripId}/timeline`} className="text-soft">
          Back to Timeline
        </Link>
      </div>
      <p className="text-soft">Stay, Transport, Activity, or Note -- pick a type below.</p>
      <EntryForm tripId={tripId} mode="create" />
    </main>
  );
}
