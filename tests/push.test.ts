import { describe, expect, it } from 'vitest';
import { blogPostUrl, buildPayload, isNotifiablePost, selectAudience } from '@/lib/push';

// spec-push-notifications: the two decisions that must never go wrong --
// WHO a published Blog Post's notification may reach, and WHERE tapping it
// lands -- are pure functions in lib/push.ts precisely so they can be
// pinned down here without a DB, a Push Service, or a browser.

const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';

const publishedPost = {
  id: POST_ID,
  tripId: TRIP_ID,
  title: 'Three days in Chiang Mai',
  entryType: 'BLOG_POST' as const,
  isPrivate: false,
  publishedAt: new Date('2026-09-03T10:00:00.000Z'),
};

const publicTrip = { id: TRIP_ID, name: 'Thailand', visibility: 'PUBLIC' as const };
const privateTrip = { ...publicTrip, visibility: 'PRIVATE' as const };

const guestSub = { userId: null };
const userSub = { userId: '44444444-4444-4444-8444-444444444444' };

describe('isNotifiablePost', () => {
  it('accepts a Published Blog Post', () => {
    expect(isNotifiablePost(publishedPost)).toBe(true);
  });

  it('rejects a Draft (publishedAt still NULL)', () => {
    expect(isNotifiablePost({ ...publishedPost, publishedAt: null })).toBe(false);
  });

  it('rejects every non-Blog entry type, published or not', () => {
    expect(isNotifiablePost({ ...publishedPost, entryType: 'STAY' as never })).toBe(false);
  });
});

describe('selectAudience', () => {
  it('notifies both Guest and User subscriptions about a public post on a Public Trip', () => {
    expect(selectAudience([guestSub, userSub], publishedPost, publicTrip)).toEqual([
      guestSub,
      userSub,
    ]);
  });

  // The whole point of the rule: a notification must never tell a Guest
  // about a post they would get a 404 on (lib/viewer.ts's canViewTrip).
  it('excludes Guest subscriptions when the Trip is PRIVATE', () => {
    expect(selectAudience([guestSub, userSub], publishedPost, privateTrip)).toEqual([userSub]);
  });

  it('excludes Guest subscriptions when the post itself is isPrivate', () => {
    const post = { ...publishedPost, isPrivate: true };
    expect(selectAudience([guestSub, userSub], post, publicTrip)).toEqual([userSub]);
  });

  it('still notifies a User subscription about a Private post on a Private Trip (AD-7)', () => {
    const post = { ...publishedPost, isPrivate: true };
    expect(selectAudience([userSub], post, privateTrip)).toEqual([userSub]);
  });

  it('notifies nobody about a Draft, whatever the Trip visibility', () => {
    const draft = { ...publishedPost, publishedAt: null };
    expect(selectAudience([guestSub, userSub], draft, publicTrip)).toEqual([]);
  });

  it('notifies nobody about a non-Blog entry type', () => {
    const stay = { ...publishedPost, entryType: 'STAY' as never };
    expect(selectAudience([guestSub, userSub], stay, publicTrip)).toEqual([]);
  });
});

describe('buildPayload', () => {
  // "The notification should take the user directly to the blog post."
  it('deep-links straight at the post, not the Blog list', () => {
    const payload = buildPayload(publishedPost, publicTrip, 'sv');
    expect(payload.url).toBe(`/trips/${TRIP_ID}/blog/${POST_ID}`);
    expect(payload.url).toBe(blogPostUrl(TRIP_ID, POST_ID));
  });

  it('writes the notification in the subscription own locale', () => {
    expect(buildPayload(publishedPost, publicTrip, 'sv').title).toBe('Nytt blogginlägg');
    expect(buildPayload(publishedPost, publicTrip, 'en').title).toBe('New blog post');
  });

  it('carries the post title and Trip name in the body', () => {
    expect(buildPayload(publishedPost, publicTrip, 'en').body).toBe(
      'Three days in Chiang Mai — Thailand',
    );
  });

  // Same tag for the same post = a re-send replaces the notification
  // instead of stacking a duplicate (public/sw.js passes it straight to
  // showNotification).
  it('tags per post so re-sends collapse', () => {
    expect(buildPayload(publishedPost, publicTrip, 'en').tag).toBe(`blog-post-${POST_ID}`);
  });
});
