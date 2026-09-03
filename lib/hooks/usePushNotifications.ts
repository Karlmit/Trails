'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// spec-push-notifications: the whole browser-side Web Push dance in one
// hook, so the two surfaces that offer the opt-in (the Blog page's prompt
// card and the Settings toggle) share one implementation and one set of
// states rather than each re-deriving "can this browser even do this".
//
// Everything here is deliberately feature-detected rather than
// UA-sniffed, with one exception (the iOS "add to Home Screen" hint below),
// because the reasons this can be unavailable are all real and common:
//   - the page is not a secure context -- Service Workers and the Push API
//     are HTTPS-only (localhost excepted). Trails' own default
//     docker-compose deployment serves plain HTTP (see COOKIE_SECURE in
//     README.md), so "you need HTTPS in front of this" is a first-class
//     state here, not an edge case.
//   - iOS/iPadOS grants Web Push only to a site installed to the Home
//     Screen; in plain Safari `window.PushManager` simply does not exist.
//   - the operator never configured a VAPID keypair (`publicKey === null`).
//   - the visitor already denied notification permission, which only they
//     can undo in browser settings -- calling requestPermission() again
//     does nothing at all.

export type PushStatus =
  /** Still reading the browser's current permission/subscription state. */
  | 'loading'
  /** No Service Worker / Push API in this browser at all. */
  | 'unsupported'
  /** Push exists, but this page is plain HTTP -- it can never work here. */
  | 'insecure'
  /** The server has no VAPID keypair configured. */
  | 'unconfigured'
  /** Available, not yet subscribed -- the opt-in can be offered. */
  | 'idle'
  /** Permission was denied; only the visitor can reverse it. */
  | 'denied'
  /** This browser is subscribed and will be notified. */
  | 'subscribed';

export interface UsePushNotifications {
  status: PushStatus;
  /** True while enable()/disable() is in flight. */
  busy: boolean;
  /** A failed enable/disable attempt, for the caller to render. */
  error: 'enableFailed' | 'disableFailed' | null;
  /**
   * True only for iOS/iPadOS Safari, where `unsupported` is not final: the
   * same page installed to the Home Screen can subscribe. Lets the caller
   * show "add Trails to your Home Screen first" instead of a dead end.
   */
  needsHomeScreenInstall: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const SUBSCRIPTIONS_ENDPOINT = '/api/v1/push/subscriptions';

/**
 * `applicationServerKey` must be raw bytes; the VAPID public key travels as
 * base64url text. (`atob` needs standard base64 and no missing padding.)
 *
 * Backed by an explicit `ArrayBuffer` rather than `new Uint8Array(length)`:
 * the latter is typed `Uint8Array<ArrayBufferLike>`, which the DOM's
 * `BufferSource` (an `ArrayBufferView<ArrayBuffer>`) does not accept, since
 * `ArrayBufferLike` also admits a `SharedArrayBuffer`.
 */
function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iOS/iPadOS Safari outside an installed PWA -- see needsHomeScreenInstall. */
function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports itself as a Mac; the touch-point count is the
  // documented way to tell an iPad apart from a real desktop Safari.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return iosStandalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function usePushNotifications(publicKey: string | null): UsePushNotifications {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'enableFailed' | 'disableFailed' | null>(null);
  const [needsHomeScreenInstall, setNeedsHomeScreenInstall] = useState(false);

  // The locale the notification text should be written in is read from the
  // <html lang> the server already rendered, rather than threaded through
  // every caller -- it is the same resolution lib/locale.ts performed.
  const localeRef = useRef<string | null>(null);

  useEffect(() => {
    localeRef.current = document.documentElement.lang || null;

    if (!publicKey) {
      setStatus('unconfigured');
      return;
    }
    if (!pushSupported()) {
      setNeedsHomeScreenInstall(isIosBrowser() && !isStandalone());
      // A plain-HTTP page is reported as `insecure` even here: on some
      // browsers the APIs are hidden entirely outside a secure context, and
      // "put HTTPS in front of this" is the actionable message either way.
      setStatus(window.isSecureContext ? 'unsupported' : 'insecure');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    let cancelled = false;
    // Only *read* existing state on mount -- registering the Service Worker
    // is deferred to enable(), so simply visiting a Blog page never
    // installs a worker for a visitor who never opts in.
    navigator.serviceWorker
      .getRegistration('/')
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        if (cancelled) return;
        setStatus(subscription ? 'subscribed' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const enable = useCallback(async () => {
    if (!publicKey || busy) return;
    setBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // `ready` rather than the register() result: a worker that is still
      // installing has no usable `pushManager` yet.
      const active = await navigator.serviceWorker.ready.catch(() => registration);

      // This is the actual "may we notify you?" browser prompt -- fired
      // only from a real click (browsers require a user gesture and
      // permanently block sites that ask on page load).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'idle');
        return;
      }

      const existing = await active.pushManager.getSubscription();
      const subscription =
        existing ??
        (await active.pushManager.subscribe({
          // Required to be true by every browser: a received push must
          // always result in a visible notification.
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }));

      const payload = subscription.toJSON();
      const response = await fetch(SUBSCRIPTIONS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: payload.endpoint,
          keys: payload.keys,
          locale: localeRef.current === 'en' || localeRef.current === 'sv' ? localeRef.current : undefined,
        }),
      });

      if (!response.ok) {
        // The browser-side subscription is useless if the server never
        // stored it (it would look enabled and never notify) -- roll it
        // back so the next attempt starts clean.
        await subscription.unsubscribe().catch(() => undefined);
        setError('enableFailed');
        setStatus('idle');
        return;
      }

      setStatus('subscribed');
    } catch {
      setError('enableFailed');
      setStatus('idle');
    } finally {
      setBusy(false);
    }
  }, [busy, publicKey]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = (await registration?.pushManager.getSubscription()) ?? null;

      if (subscription) {
        // Server first: if this browser unsubscribes locally but the row
        // survives, the endpoint is dead and every later publish wastes a
        // send on it until the Push Service 410s it away.
        await fetch(SUBSCRIPTIONS_ENDPOINT, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setStatus('idle');
    } catch {
      setError('disableFailed');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { status, busy, error, needsHomeScreenInstall, enable, disable };
}
