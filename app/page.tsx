import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { decideLandingTrip } from '@/lib/app-landing';
import { getViewer } from '@/lib/viewer';

// FR-7: app-level landing. By the time this renders, middleware (AD-6/AD-7)
// has already guaranteed either an authenticated User, a Guest (root is
// Guest-eligible per proxy.ts, added for this single-Trip-at-a-time
// deployment), or a bootstrap redirect to /signup -- this component only
// decides *which* Trip's Timeline to land on. The decision itself is a
// pure function (decideLandingTrip) so it's unit-testable without a
// database; this component just fetches Trips and acts on the redirect.
export default async function AppRootPage() {
  const viewer = await getViewer();

  // Explicit, deterministic ordering: decideLandingTrip tie-breaks by id
  // internally too, but fetching in a stable order here means repeated
  // requests see the same input ordering, not just the same output.
  const trips = await prisma.trip.findMany({
    where: viewer.type === 'guest' ? { visibility: 'PUBLIC' } : undefined,
    orderBy: { id: 'asc' },
  });

  const decision = decideLandingTrip(trips);
  if (decision.tripId) {
    redirect(`/trips/${decision.tripId}/timeline`);
  }

  if (viewer.type === 'guest') {
    // No Public Trip qualifies (none exist, or the only one(s) are Private)
    // -- unlike the authenticated fallback below, redirecting a Guest to
    // /trips would just bounce them straight to /login (that page is
    // requireAuth, not Guest-eligible), which isn't a real landing
    // experience. Show a plain, honest empty state instead; the Login
    // button lives in TopNav (rendered on every page) so the actual owner
    // can still get back in from here.
    return (
      <main className="page">
        <div className="empty-state">Nothing to see here yet.</div>
      </main>
    );
  }

  // Zero-Trip instance (or no Trip qualifies): no Timeline exists yet, so
  // land on the Trip list empty state instead (not covered by FR-7, called
  // out there as a gap).
  redirect('/trips');
}
