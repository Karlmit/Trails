import { describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { canViewTrip, filterForViewer, type Viewer } from '@/lib/viewer';

// spec-guest-access (FR-28/AD-10): the two pure predicates every
// Guest-eligible read path calls -- unit-tested directly against the
// spec's frozen I/O matrix, independent of any live page render (that's
// covered separately by proxy.test.ts + the live Playwright/curl pass).

const FAKE_USER = { id: 'user-1' } as User;
const USER_VIEWER: Viewer = { type: 'user', user: FAKE_USER };
const GUEST_VIEWER: Viewer = { type: 'guest' };

describe('canViewTrip', () => {
  it('a User can always view a Public Trip', () => {
    expect(canViewTrip({ visibility: 'PUBLIC' }, USER_VIEWER)).toBe(true);
  });

  it('a User can always view a Private Trip', () => {
    expect(canViewTrip({ visibility: 'PRIVATE' }, USER_VIEWER)).toBe(true);
  });

  it('a Guest can view a Public Trip', () => {
    expect(canViewTrip({ visibility: 'PUBLIC' }, GUEST_VIEWER)).toBe(true);
  });

  it('a Guest cannot view a Private Trip', () => {
    expect(canViewTrip({ visibility: 'PRIVATE' }, GUEST_VIEWER)).toBe(false);
  });
});

describe('filterForViewer', () => {
  const items = [
    { id: '1', isPrivate: false },
    { id: '2', isPrivate: true },
    { id: '3', isPrivate: false },
  ];

  it('returns every item unchanged for a User, Private items included', () => {
    expect(filterForViewer(items, USER_VIEWER)).toEqual(items);
  });

  it('strips every isPrivate=true item for a Guest', () => {
    const result = filterForViewer(items, GUEST_VIEWER);
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('returns an empty array for a Guest when every item is Private', () => {
    const allPrivate = [{ id: '1', isPrivate: true }];
    expect(filterForViewer(allPrivate, GUEST_VIEWER)).toEqual([]);
  });

  it('returns every item for a Guest when none are Private', () => {
    const noPrivate = [{ id: '1', isPrivate: false }];
    expect(filterForViewer(noPrivate, GUEST_VIEWER)).toEqual(noPrivate);
  });
});
