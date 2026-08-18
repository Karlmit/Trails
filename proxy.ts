import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, validateSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// AD-6/AD-7: this is the architecture's "middleware.ts", explicitly opting
// into the Node.js runtime (not the Edge default) so it can query
// `sessions` via Prisma directly -- there is exactly one auth code path
// (`validateSession`, shared with Route Handlers), not a lightweight Edge
// check plus a separate authoritative one.
//
// DEVIATION FROM THE SPEC'S LITERAL FILENAME, disclosed per "Ask First":
// the Code Map names this file `middleware.ts`. In Next.js 16.3.1 that
// convention still works but is deprecated in favor of `proxy.ts`, and
// verified by a local `next build`: under the `middleware.ts` name,
// Turbopack still targets it at the Edge runtime by default (a build
// warning flagged `node:crypto` -- used by lib/session.ts -- as
// Edge-incompatible), which would silently violate AD-6's Node.js-runtime
// requirement. Renaming to `proxy.ts` (same exported check, Next's
// documented migration path) is what actually gets the Node.js runtime
// AD-6 asks for; the `middleware` function name became `proxy` to match.
//
// AD-7's three route classes, as wired up so far:
//   - public (no session required): /login, /signup pages, and
//     /api/v1/auth itself (login/signup/logout all live behind that one
//     route; each action re-validates what it needs internally, e.g. the
//     bootstrap zero-Users gate for signup).
//   - requireAuth (everything else matched below): every other page and
//     every other /api/v1/** route.
//   - guest (spec-guest-access, FR-28): exactly five page shapes, added
//     below via GUEST_ELIGIBLE_PATH -- an unauthenticated request is let
//     through instead of redirected to /login. This is narrowly "is an
//     anonymous visitor even allowed to reach this route at all" -- it does
//     NOT decide whether the underlying Trip is actually Public/Private (a
//     Private Trip's URL still reaches the page, which 404s it itself via
//     lib/viewer.ts's canViewTrip/filterForViewer). No /api/v1/** route is
//     ever added to this allowlist (spec's "Ask First"/"Never": the API
//     surface's auth model is unchanged by this spec).

const PUBLIC_PAGE_PATHS = new Set(['/login', '/signup']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGE_PATHS.has(pathname)) return true;
  if (pathname === '/api/v1/auth') return true;
  return false;
}

// Same UUID shape as lib/uuid.ts's isUuid, inlined as a regex fragment here
// since this matcher needs to compose it into a larger pattern rather than
// test a single already-extracted param string. Case-insensitive on its own
// (mixed-case hex is a valid UUID textual form) -- but composed into
// GUEST_ELIGIBLE_PATH below WITHOUT a whole-pattern `i` flag, so the literal
// path segments (overview/timeline/blog/entries) stay strictly
// case-sensitive, matching Next.js's own case-sensitive routing exactly
// (an `i` flag on the whole pattern would make e.g. "/Trips/.../Overview"
// match here even though no such literal route exists).
const UUID_RE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

// Exactly the five URL shapes named in the spec's Intent -- the same routes
// an authenticated User already uses, not a separate /guest/... prefix.
// Deliberately precise: must NOT match /trips/{uuid}/entries/new (entry
// creation) or any other Trip subpath (Budget, Sections, Ideas, ...).
const GUEST_ELIGIBLE_PATH = new RegExp(
  `^/trips/${UUID_RE}/(overview|timeline|blog|entries/${UUID_RE}|blog/${UUID_RE})$`,
);

function isGuestEligiblePath(pathname: string): boolean {
  return GUEST_ELIGIBLE_PATH.test(pathname);
}

function bearerToken(request: NextRequest): string | undefined {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice('bearer '.length).trim();
  }
  return undefined;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? bearerToken(request);
  const result = await validateSession(token);

  if (!result) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }
    // spec-guest-access, FR-28: let an anonymous visitor through to one of
    // the five Guest-eligible page shapes -- the page itself (via
    // lib/viewer.ts) decides whether the Trip/item is actually visible.
    if (isGuestEligiblePath(pathname)) {
      return NextResponse.next();
    }
    // FR-29 bootstrap: an unauthenticated visitor to any protected page on a
    // brand-new instance (zero Users) lands on /signup, not /login.
    const userCount = await prisma.user.count();
    const destination = userCount === 0 ? '/signup' : '/login';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
};
