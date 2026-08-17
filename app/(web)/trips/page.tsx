import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, tripDurationDays } from '@/lib/trip-status';
import { NewTripForm } from '@/components/NewTripForm';
import { DeleteTripButton } from '@/components/DeleteTripButton';

const STATUS_BADGE_CLASS: Record<string, string> = {
  UPCOMING: 'badge-upcoming',
  ACTIVE: 'badge-active',
  COMPLETED: 'badge-completed',
};

export default async function TripsPage() {
  const trips = await prisma.trip.findMany({ orderBy: { startDate: 'desc' } });

  return (
    <main className="page-wide">
      <div className="row-between">
        <h1>Trips</h1>
        <NewTripForm />
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <p>No Trips yet. Create your first Trip to start building a Timeline.</p>
        </div>
      ) : (
        <div className="trip-card-grid">
          {trips.map((trip) => {
            const status = computeTripStatus(trip);
            return (
              <div key={trip.id} className="trip-card">
                <div className="row-between">
                  <h3 style={{ margin: 0 }}>{trip.name}</h3>
                  <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{status}</span>
                </div>
                {trip.destination && <p className="text-soft" style={{ margin: 0 }}>{trip.destination}</p>}
                <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {trip.startDate.toISOString().slice(0, 10)} → {trip.endDate.toISOString().slice(0, 10)} ·{' '}
                  {tripDurationDays(trip)} days
                </p>
                <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                  <Link href={`/trips/${trip.id}/timeline`} className="btn btn-primary">
                    Open Timeline
                  </Link>
                  <Link href={`/trips/${trip.id}/overview`} className="btn btn-outline">
                    Overview
                  </Link>
                  <DeleteTripButton tripId={trip.id} tripName={trip.name} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
