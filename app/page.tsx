import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { decideLandingTrip } from '@/lib/app-landing';

// FR-7: app-level landing. By the time this renders, middleware (AD-6/AD-7)
// has already guaranteed either an authenticated User or a bootstrap
// redirect to /signup -- this component only decides *which* Trip's
// Timeline to land on. The decision itself is a pure function
// (decideLandingTrip) so it's unit-testable without a database; this
// component just fetches Trips and acts on the redirect.
export default async function AppRootPage() {
  // Explicit, deterministic ordering: decideLandingTrip tie-breaks by id
  // internally too, but fetching in a stable order here means repeated
  // requests see the same input ordering, not just the same output.
  const trips = await prisma.trip.findMany({ orderBy: { id: 'asc' } });

  const decision = decideLandingTrip(trips);
  if (decision.tripId) {
    redirect(`/trips/${decision.tripId}/timeline`);
  }

  // Zero-Trip instance (or no Trip qualifies): no Timeline exists yet, so
  // land on the Trip list empty state instead (not covered by FR-7, called
  // out there as a gap).
  redirect('/trips');
}
