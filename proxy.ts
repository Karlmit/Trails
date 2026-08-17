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
// AD-7's three route classes, as wired up so far (this spec has no
// `requireAdmin` or `public`/Guest surface yet -- both deferred):
//   - public (no session required): /login, /signup pages, and
//     /api/v1/auth itself (login/signup/logout all live behind that one
//     route; each action re-validates what it needs internally, e.g. the
//     bootstrap zero-Users gate for signup).
//   - requireAuth (everything else matched below): every other page and
//     every other /api/v1/** route.

const PUBLIC_PAGE_PATHS = new Set(['/login', '/signup']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGE_PATHS.has(pathname)) return true;
  if (pathname === '/api/v1/auth') return true;
  return false;
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
