import { describe, expect, it } from 'vitest';
import TripRootPage from '@/app/(web)/trips/[tripId]/page';

// FR-6: opening a Trip lands on its Timeline first, never Overview. Next's
// `redirect()` works by throwing an error carrying a `digest` describing
// the destination -- no request/router harness needed to observe it.
describe('TripRootPage (FR-6)', () => {
  it('redirects to the Trip\'s Timeline, not Overview', async () => {
    await expect(TripRootPage({ params: Promise.resolve({ tripId: 'trip-123' }) })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/trips/trip-123/timeline;307;',
    });
  });
});
