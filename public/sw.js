// Trails Service Worker -- spec-push-notifications.
//
// This file exists for exactly one reason: a `push` event can only be
// delivered to a Service Worker, so notifications are impossible without
// one. It deliberately does NOT cache anything or intercept `fetch`:
// Trails' pages are Server-Rendered and session-dependent (Draft/Private
// content differs per viewer), so an offline cache here would be a
// correctness hazard, not a feature. Registering this worker changes
// nothing about how the app loads.
//
// Served from /sw.js (public/) so its scope is the whole origin, and
// excluded from proxy.ts's matcher -- a Guest's browser fetches it with no
// session, and a redirect to /login would silently break registration.

// A new worker replaces the old one immediately instead of waiting for
// every tab to close -- there is no cached state to migrate, and a stale
// worker that predates a payload change would show the wrong notification.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// The payload shape is lib/push.ts's `PushPayload`.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no/garbled data still has to produce a visible
    // notification: every browser that supports the Push API requires that
    // a received push shows one ("userVisibleOnly"), and silently
    // swallowing it risks the browser revoking the subscription.
    payload = {};
  }

  const title = payload.title || 'Trails';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // Same tag for the same post = a re-send replaces the existing
      // notification instead of stacking a second copy.
      tag: payload.tag || 'trails',
      // The click handler below reads the destination back from here --
      // `notification.data` is the only thing that survives the worker
      // being torn down between the push and the click.
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/';

  // "Take the user directly to the blog post": prefer a tab already on that
  // exact post, then any open Trails tab (navigated to the post), and only
  // open a new window as a last resort -- otherwise every notification click
  // leaves another duplicate tab behind.
  //
  // Both `focus()` and `navigate()` can reject (a client the browser will
  // not let us focus, a tab closing mid-click), and this whole promise is
  // the click's `waitUntil` -- so a rejection anywhere means the click does
  // NOTHING at all, the one outcome worse than landing in a new tab.
  // Verified live: focus() throws `InvalidAccessError: Not allowed to focus
  // a window` outside a genuine user-activated click. Hence every step is
  // attempted, never assumed, and openWindow is the guaranteed fallback.
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(target, self.location.origin);
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const sameOrigin = clientList.filter((client) => {
        try {
          return new URL(client.url).origin === targetUrl.origin;
        } catch {
          return false;
        }
      });

      // Exact match first: already on the post, so focusing is enough.
      const exact = sameOrigin.find((client) => client.url === targetUrl.href);
      if (exact) {
        try {
          await exact.focus();
          return;
        } catch {
          // Fall through: a new window is better than nothing.
        }
      }

      for (const client of sameOrigin) {
        if (!('navigate' in client)) continue;
        try {
          // Navigate first, focus second: navigation is the part that
          // matters, and it does not depend on focus succeeding.
          const navigated = await client.navigate(targetUrl.href);
          await (navigated || client).focus().catch(() => undefined);
          return;
        } catch {
          // Try the next client, then fall back to a new window.
        }
      }

      await self.clients.openWindow(targetUrl.href);
    })(),
  );
});
