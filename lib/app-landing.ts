import { computeTripStatus, type TripDateRange, type TripStatus } from '@/lib/trip-status';

// FR-7: app-level landing decision, extracted as a pure function (mirrors
// computeTripStatus) so the "which Trip's Timeline to land on" rule is
// unit-testable without a database or Next's `redirect()`.
//
// Precedence: Active Trip's Timeline; else the nearest-starting Upcoming
// Trip's Timeline; else the most-recently-ended Completed Trip's Timeline;
// else no Trip at all (zero-Trip instance -- caller redirects to /trips,
// a gap FR-7 itself calls out).

export interface LandingTrip extends TripDateRange {
  id: string;
}

export type LandingDecision = { tripId: string } | { tripId: null };

/** Deterministic tie-break for Trips whose primary sort key is equal. */
function byIdAscending(a: { trip: LandingTrip }, b: { trip: LandingTrip }): number {
  if (a.trip.id < b.trip.id) return -1;
  if (a.trip.id > b.trip.id) return 1;
  return 0;
}

export function decideLandingTrip(trips: LandingTrip[], now: Date = new Date()): LandingDecision {
  if (trips.length === 0) {
    return { tripId: null };
  }

  const withStatus: { trip: LandingTrip; status: TripStatus }[] = trips.map((trip) => ({
    trip,
    status: computeTripStatus(trip, now),
  }));

  // Multiple Trips can be simultaneously Active (or tie on the same
  // start/end date); without a deterministic secondary sort, `.find`/`.sort`
  // would land on whichever row `prisma.trip.findMany()` happened to return
  // first -- which, absent an explicit `orderBy`, is not guaranteed to be
  // stable across requests. Break every tie by id so repeated requests
  // always land on the same Trip.
  const active = withStatus.filter((t) => t.status === 'ACTIVE').sort(byIdAscending);
  if (active.length > 0) {
    return { tripId: active[0].trip.id };
  }

  const upcoming = withStatus
    .filter((t) => t.status === 'UPCOMING')
    .sort(
      (a, b) => a.trip.startDate.getTime() - b.trip.startDate.getTime() || byIdAscending(a, b),
    );
  if (upcoming.length > 0) {
    return { tripId: upcoming[0].trip.id };
  }

  const completed = withStatus
    .filter((t) => t.status === 'COMPLETED')
    .sort((a, b) => b.trip.endDate.getTime() - a.trip.endDate.getTime() || byIdAscending(a, b));
  if (completed.length > 0) {
    return { tripId: completed[0].trip.id };
  }

  return { tripId: null };
}
