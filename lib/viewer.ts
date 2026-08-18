import type { User } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';

// FR-28, AD-10, spec-guest-access: the one shared "who is looking at this
// page" resolution, and the two predicates every Guest-eligible read path
// (Overview, Timeline, Entry detail, Blog list, Blog detail) calls instead
// of re-implementing "is this visible to a Guest" inline. Deliberately the
// only place `Trip.visibility`/`TimelineEntry.isPrivate` are evaluated for
// read access (Boundaries: "no page re-implements the predicate inline").

/**
 * A `guest` is simply "no valid session" on an allowlisted path (proxy.ts's
 * `GUEST_ELIGIBLE_PATH`) -- there is no Guest account/session of any kind
 * (Boundaries: "Never ... No session/account of any kind for a Guest").
 */
export type Viewer = { type: 'user'; user: User } | { type: 'guest' };

/** Server-Component-friendly viewer resolution, wrapping `getSessionUser()`. */
export async function getViewer(): Promise<Viewer> {
  const user = await getSessionUser();
  return user ? { type: 'user', user } : { type: 'guest' };
}

/**
 * AD-7: any authenticated User has full access to every Trip (no
 * per-Trip ownership/membership model exists) -- a Guest only ever sees a
 * Trip whose `visibility` is PUBLIC. A Guest failing this check gets
 * `notFound()` from the caller, never a redirect or a 403 (Boundaries).
 */
export function canViewTrip(trip: { visibility: 'PUBLIC' | 'PRIVATE' }, viewer: Viewer): boolean {
  if (viewer.type === 'user') return true;
  return trip.visibility === 'PUBLIC';
}

/**
 * A User sees every item unchanged (Drafts and Private items included, per
 * the I/O matrix); a Guest never sees an item marked `isPrivate`.
 */
export function filterForViewer<T extends { isPrivate: boolean }>(items: T[], viewer: Viewer): T[] {
  if (viewer.type === 'user') return items;
  return items.filter((item) => !item.isPrivate);
}
