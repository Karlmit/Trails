// spec-push-notifications: the VAPID keypair, split out from lib/push.ts so
// a Server Component that only needs the public key (the Blog page and
// Settings, which pass it down to the client) does not pull the `web-push`
// module -- and its node:crypto/node:https dependencies -- into its own
// import graph.
//
// Web Push, unlike FCM/APNs, needs no third-party account: the browser
// mints its own Push Service endpoint and we authenticate to that service
// with this self-generated keypair (`npx web-push generate-vapid-keys`).
// The keypair is configuration, not data -- the private half is read from
// the environment and never stored in the DB -- and it must stay STABLE
// across deployments: every existing browser subscription is bound to the
// public key it was created with, so rotating these silently kills them all
// (every subscriber has to opt in again).

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';

/**
 * Push Services require a contact for the pushing party (`mailto:` or an
 * https URL). Only used by them to reach an operator about a misbehaving
 * sender -- never shown to a subscriber.
 */
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

export const vapidKeys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };

/**
 * True only when both halves of the keypair are configured. Every
 * notification surface degrades to "not available" rather than erroring
 * when this is false -- an operator who never sets the env vars gets an app
 * that behaves exactly as it did before this feature existed.
 */
export function isPushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0 && VAPID_PRIVATE_KEY.length > 0;
}

/**
 * The half of the keypair that is safe to hand the browser -- it is passed
 * to `pushManager.subscribe({ applicationServerKey })` client-side.
 * Returned as `null` (not an empty string) when unconfigured, so a Server
 * Component can pass it straight down as a nullable prop and the whole
 * client surface disappears on its own.
 */
export function getPushPublicKey(): string | null {
  return isPushConfigured() ? VAPID_PUBLIC_KEY : null;
}
