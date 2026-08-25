import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { computeTripStatus } from '@/lib/trip-status';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, getViewer } from '@/lib/viewer';
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

  const t = await getTranslations('tripShell');

  // spec-guest-access, defense-in-depth (frozen Intent): resolved and
  // checked FIRST, before any Trip-specific markup (name, status badge,
  // tabs) is constructed -- this layout does not rely on a child page's
  // later notFound() to unwind an already-rendered parent.
  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const status = computeTripStatus(trip);

  const STATUS_LABEL: Record<string, string> = {
    UPCOMING: t('statusUpcoming'),
    ACTIVE: t('statusActive'),
    COMPLETED: t('statusCompleted'),
  };

  return (
    <div>
      <div className="page-wide" style={{ paddingBottom: 0 }}>
        <div className="row-between">
          <h1 style={{ marginBottom: 0 }}>{trip.name}</h1>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
            {/* FR-27, spec-travel-mode: launched from within an Active Trip
                rather than sitting alongside the tabs -- this is why it's a
                button next to the status badge here, not a TripTabs entry.
                ACTIVE-only per the spec's Intent/I-O matrix. Guest-only
                Travel Mode is out of scope (spec-guest-access's Never list). */}
            {viewer.type === 'user' && status === 'ACTIVE' && (
              <Link href={`/trips/${tripId}/travel-mode`} className="btn btn-primary">
                {t('travelMode')}
              </Link>
            )}
          </div>
        </div>
      </div>
      <TripTabs tripId={tripId} viewer={viewer.type} />
      {children}
    </div>
  );
}
