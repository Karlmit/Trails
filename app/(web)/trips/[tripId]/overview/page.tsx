import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTrip } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { TripOverviewPanel } from '@/components/TripOverviewPanel';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-4: Overview shows name, destination, start/end date, computed
// Duration, cover image, and computed Status -- always derived, never a
// separate Overview-only value.
export default async function TripOverviewPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  return (
    <main className="page">
      <TripOverviewPanel trip={serializeTrip(trip)} />
    </main>
  );
}
