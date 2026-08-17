import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { computeTripStatus } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { TripTabs } from '@/components/TripTabs';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  UPCOMING: 'badge-upcoming',
  ACTIVE: 'badge-active',
  COMPLETED: 'badge-completed',
};

export default async function TripLayout({ children, params }: LayoutProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const status = computeTripStatus(trip);

  return (
    <div>
      <div className="page-wide" style={{ paddingBottom: 0 }}>
        <div className="row-between">
          <h1 style={{ marginBottom: 0 }}>{trip.name}</h1>
          <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{status}</span>
        </div>
      </div>
      <TripTabs tripId={tripId} />
      {children}
    </div>
  );
}
