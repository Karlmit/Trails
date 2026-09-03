import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isPushConfigured } from '@/lib/push-config';
import { DEFAULT_LOCALE, isAppLocale, LOCALE_COOKIE_NAME } from '@/lib/locale';
import { pushSubscriptionCreateSchema, pushSubscriptionDeleteSchema } from '@/lib/validation';

// spec-push-notifications: the browser's own opt-in/opt-out endpoint, one
// route file discriminated by HTTP method (the same convention as
// app/api/v1/auth and .../publish -- PUT publish / DELETE unpublish there):
//   POST   /api/v1/push/subscriptions -- store (upsert) this browser's subscription
//   DELETE /api/v1/push/subscriptions -- forget it again
//
// DISCLOSED GUEST-ELIGIBLE API EXCEPTION (AD-7, proxy.ts): this is the
// second /api/v1/** path ever added to proxy.ts's Guest allowlist, after
// spec-tags-links-photos' `GET /api/v1/photos/{uuid}/file`. It is required
// by the feature's own audience decision: a Guest reading a PUBLIC Trip's
// Blog -- who has no session and no account of any kind (lib/viewer.ts) --
// must be able to approve notifications, and their browser has nothing but
// this endpoint to hand its subscription to. The exception is scoped as
// narrowly as the Photos one: this exact path only, POST/DELETE only, and
// what an anonymous row may ever be *told* is separately restricted at send
// time by lib/push.ts's `selectAudience` (Published, non-Private, PUBLIC
// Trip only) rather than trusted here.
//
// A subscription is deliberately NOT scoped to a Trip. The subscribe UI
// lives on a Trip's Blog page, but the opt-in it takes is app-wide ("notify
// me when a new blog post is published") -- this deployment plans one Trip
// at a time (see proxy.ts's root-route comment), so a per-Trip fan-out list
// would be a distinction without a difference, and the copy in
// messages/*.json is worded to promise exactly what is stored.

/** Resolves the locale to write this subscriber's notifications in. */
function resolveSubscriptionLocale(
  request: NextRequest,
  bodyLocale: 'sv' | 'en' | undefined,
  userLocale: 'sv' | 'en' | undefined,
) {
  // Same priority order as lib/locale.ts's pickLocale -- a signed-in User's
  // stored preference first, then the Guest's own cookie, then Swedish --
  // except that an explicit body locale (what the page was actually
  // rendered in when the visitor clicked Enable) wins over the cookie.
  if (userLocale) return userLocale;
  if (bodyLocale) return bodyLocale;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  return isAppLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

export async function POST(request: NextRequest) {
  // 503, not 500: an operator who has not set VAPID_PUBLIC_KEY/
  // VAPID_PRIVATE_KEY has simply not enabled this feature. The client
  // surfaces are hidden in that case anyway (the public key is passed down
  // as `null`), so this is only reachable by a stale page or a direct call.
  if (!isPushConfigured()) {
    return Errors.serviceUnavailable('Push notifications are not configured on this server');
  }

  // Unlike every other route in this API, a missing/invalid session is NOT
  // an error here -- it is an anonymous Guest subscription (`userId: null`).
  const user = await getUserFromApiRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = pushSubscriptionCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const locale = resolveSubscriptionLocale(request, parsed.locale, user?.locale);

  // Upsert on `endpoint`, the natural key: a browser re-registering its
  // Service Worker (every page load, in practice) hands us the same
  // endpoint back, and a visitor who signs in after subscribing as a Guest
  // must have their existing row claimed rather than duplicated.
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.endpoint },
    create: {
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
      userId: user?.id ?? null,
      locale,
    },
    update: {
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
      userId: user?.id ?? null,
      locale,
    },
  });

  // The endpoint is the only field the client ever needs back (it posts it
  // again to unsubscribe) and it is what the client already sent -- the row
  // id is deliberately not exposed, since it is the one handle that would
  // let a caller act on someone else's subscription.
  return NextResponse.json({ endpoint: subscription.endpoint }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = pushSubscriptionDeleteSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  // Knowing the endpoint IS the authorization here: it is unguessable
  // browser-minted material only that browser (and this server) ever holds,
  // and it is the only handle an anonymous Guest has on their own row. A
  // `deleteMany` so an already-forgotten endpoint is a clean 204 rather
  // than a 404 -- unsubscribing twice is not an error.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.endpoint } });

  // 204, matching every other DELETE in this API.
  return new NextResponse(null, { status: 204 });
}
