import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeTrip } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, getViewer } from '@/lib/viewer';
import { TripOverviewPanel } from '@/components/TripOverviewPanel';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-4: Overview shows name, destination, start/end date, computed
// Duration, cover image, and computed Status -- always derived, never a
// separate Overview-only value.
//
// spec-guest-access: one of the five Guest-eligible page shapes -- repeats
// the layout's own canViewTrip check (defense-in-depth, spec's frozen
// Intent: "no single check is trusted as sufficient on its own").
export default async function TripOverviewPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  return (
    <main className="page">
      <TripOverviewPanel trip={serializeTrip(trip)} readOnly={viewer.type === 'guest'} />
    </main>
  );
}
