import webpush, { WebPushError } from 'web-push';
import type { Locale, PushSubscription, TimelineEntry, Trip } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPushConfigured, vapidKeys, VAPID_SUBJECT } from '@/lib/push-config';

// spec-push-notifications: the sending side of Web Push -- who a given Blog
// Post's notification may go to, what it says, and the actual encrypted
// fan-out (including pruning endpoints the Push Service has retired). The
// VAPID keypair itself lives in lib/push-config.ts, which the client-facing
// Server Components import instead of this module.
//
// AD-13-adjacent note: there is no job queue in this stack, so the fan-out
// is awaited inline in the publish Route Handler. That is deliberate for
// this deployment's scale (one household plus its Blog readers -- tens of
// subscriptions, not thousands) and is why `sendBlogPostNotification` never
// throws: a Push Service being slow or down must not fail the publish it is
// reporting on.

/** What the Service Worker (`public/sw.js`) receives as its `event.data`. */
export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification click opens. */
  url: string;
  /** Collapses re-sends of the same post into one notification. */
  tag: string;
}

let vapidConfigured = false;

function ensureVapidDetails() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  vapidConfigured = true;
}

/** The one place a Blog Post's canonical in-app URL is built. */
export function blogPostUrl(tripId: string, entryId: string): string {
  return `/trips/${tripId}/blog/${entryId}`;
}

type NotifiablePost = Pick<TimelineEntry, 'id' | 'tripId' | 'title' | 'entryType' | 'isPrivate'> & {
  publishedAt: Date | null;
};
type NotifiableTrip = Pick<Trip, 'id' | 'name' | 'visibility'>;
type AudienceSubscription = Pick<PushSubscription, 'userId'>;

/**
 * Whether a post is a legitimate notification subject at all: a Published
 * Blog Post, nothing else. Draft posts and every non-Blog entry type are
 * silently ignored -- there is exactly one caller (the publish route), but
 * this keeps "would this ever notify anyone" answerable without a DB.
 */
export function isNotifiablePost(post: NotifiablePost): boolean {
  return post.entryType === 'BLOG_POST' && post.publishedAt !== null;
}

/**
 * The audience rule, as a pure function over already-loaded rows so it is
 * unit-testable: an authenticated User's subscription is notified about
 * every published Blog Post (AD-7 -- any User already has full read access
 * to every Trip, Private and Draft alike), while an anonymous Guest
 * subscription (`userId === null`) is only ever notified about a post the
 * same Guest could actually open: Published, not `isPrivate`, on a PUBLIC
 * Trip.
 *
 * This mirrors lib/viewer.ts's canViewTrip/filterForViewer pair for the
 * push surface -- a notification must never tell a Guest that a post they
 * would get a 404 on exists.
 */
export function selectAudience<T extends AudienceSubscription>(
  subscriptions: T[],
  post: NotifiablePost,
  trip: NotifiableTrip,
): T[] {
  if (!isNotifiablePost(post)) return [];
  const guestVisible = trip.visibility === 'PUBLIC' && !post.isPrivate;
  if (guestVisible) return subscriptions;
  return subscriptions.filter((subscription) => subscription.userId !== null);
}

/**
 * The notification's own copy, per locale. Kept as a plain switch rather
 * than going through next-intl: `getTranslations` is request-scoped around
 * the *reader's* locale, but one publish fans out to subscribers in
 * different locales at once, so each payload is built for its own
 * subscription's stored `locale` instead.
 */
export function buildPayload(
  post: Pick<TimelineEntry, 'id' | 'tripId' | 'title'>,
  trip: Pick<Trip, 'name'>,
  locale: Locale,
): PushPayload {
  const title = locale === 'en' ? 'New blog post' : 'Nytt blogginlägg';
  return {
    title,
    // The post's own title is the useful line; the Trip name gives it
    // context on a lock screen with no other chrome around it.
    body: `${post.title} — ${trip.name}`,
    url: blogPostUrl(post.tripId, post.id),
    tag: `blog-post-${post.id}`,
  };
}

/**
 * A Push Service reporting 404/410 means that endpoint is permanently gone
 * (the browser was uninstalled, its site data cleared, or permission
 * revoked) -- the subscription row is dead and must be deleted, or every
 * later publish keeps paying for it. Any other status is transient and the
 * row is kept.
 */
function isExpiredSubscriptionError(err: unknown): boolean {
  return err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410);
}

export interface FanOutResult {
  sent: number;
  failed: number;
  pruned: number;
}

/**
 * Encrypts and delivers one payload per subscription, prunes the endpoints
 * the Push Service has retired, and never throws -- see this file's header
 * for why the publish it reports on must not fail with it.
 */
export async function sendToSubscriptions(
  subscriptions: Array<Pick<PushSubscription, 'id' | 'endpoint' | 'p256dh' | 'auth' | 'locale'>>,
  buildFor: (locale: Locale) => PushPayload,
): Promise<FanOutResult> {
  if (subscriptions.length === 0 || !isPushConfigured()) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  ensureVapidDetails();

  const expiredIds: string[] = [];
  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(buildFor(subscription.locale)),
          // A notification about a new Blog Post is worth holding for a
          // phone that is currently off/offline, but is worthless a week
          // later -- 24h.
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        if (isExpiredSubscriptionError(err)) {
          expiredIds.push(subscription.id);
        }
        throw err;
      }
    }),
  );

  if (expiredIds.length > 0) {
    // Best-effort cleanup: a failure here is not worth surfacing (the rows
    // are simply retried and pruned again on the next publish).
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: expiredIds } } })
      .catch(() => undefined);
  }

  const sent = results.filter((result) => result.status === 'fulfilled').length;
  return { sent, failed: results.length - sent, pruned: expiredIds.length };
}

/**
 * The whole publish-time fan-out: pick the audience for this post, build
 * each subscriber's payload in their own locale, deliver. Returns a result
 * even when nothing was sent (unconfigured, no subscribers, or a post no
 * one may be told about) so the caller can log without branching.
 */
export async function sendBlogPostNotification(
  post: NotifiablePost & Pick<TimelineEntry, 'title'>,
  trip: NotifiableTrip,
): Promise<FanOutResult> {
  if (!isPushConfigured() || !isNotifiablePost(post)) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    select: { id: true, endpoint: true, p256dh: true, auth: true, locale: true, userId: true },
  });
  const audience = selectAudience(subscriptions, post, trip);

  return sendToSubscriptions(audience, (locale) => buildPayload(post, trip, locale));
}
