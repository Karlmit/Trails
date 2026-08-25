import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('trips');
  const trips = await prisma.trip.findMany({ orderBy: { startDate: 'desc' } });

  const STATUS_LABEL: Record<string, string> = {
    UPCOMING: t('statusUpcoming'),
    ACTIVE: t('statusActive'),
    COMPLETED: t('statusCompleted'),
  };

  return (
    <main className="page-wide">
      <div className="row-between">
        <h1>{t('title')}</h1>
        <NewTripForm />
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <p>{t('emptyState')}</p>
        </div>
      ) : (
        <div className="trip-card-grid">
          {trips.map((trip) => {
            const status = computeTripStatus(trip);
            return (
              <div key={trip.id} className="trip-card">
                <div className="row-between">
                  <h3 style={{ margin: 0 }}>{trip.name}</h3>
                  <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                </div>
                {trip.destination && <p className="text-soft" style={{ margin: 0 }}>{trip.destination}</p>}
                <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {trip.startDate.toISOString().slice(0, 10)} → {trip.endDate.toISOString().slice(0, 10)} ·{' '}
                  {t('durationDays', { count: tripDurationDays(trip) })}
                </p>
                <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                  <Link href={`/trips/${trip.id}/timeline`} className="btn btn-primary">
                    {t('openTimeline')}
                  </Link>
                  <Link href={`/trips/${trip.id}/overview`} className="btn btn-outline">
                    {t('overview')}
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
