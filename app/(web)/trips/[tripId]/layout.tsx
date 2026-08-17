import Link from 'next/link';
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
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{status}</span>
            {/* FR-27, spec-travel-mode: launched from within an Active Trip
                rather than sitting alongside the tabs -- this is why it's a
                button next to the status badge here, not a TripTabs entry.
                ACTIVE-only per the spec's Intent/I-O matrix. */}
            {status === 'ACTIVE' && (
              <Link href={`/trips/${tripId}/travel-mode`} className="btn btn-primary">
                Travel Mode
              </Link>
            )}
          </div>
        </div>
      </div>
      <TripTabs tripId={tripId} />
      {children}
    </div>
  );
}
