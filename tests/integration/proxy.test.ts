import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { proxy } from '@/proxy';
import { issueSession } from '@/lib/session';

function requestFor(pathname: string, options: { cookie?: string } = {}) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: options.cookie ? { cookie: options.cookie } : undefined,
  });
}

// AD-6/AD-7: proxy.ts (renamed from middleware.ts, see spec Design Notes) is
// the sole page/API auth gate -- exercised directly here with constructed
// NextRequests, not just indirectly through whatever page/route happens to
// sit behind it. Requires a live Postgres via DATABASE_URL, since
// validateSession and the zero-Users bootstrap check both query it.
describe.skipIf(!hasTestDatabase)('proxy (AD-6/AD-7 auth gate)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('redirects an unauthenticated request for a protected page to /login once a User exists', async () => {
    await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });

    const res = await proxy(requestFor('/trips'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('redirects an unauthenticated request for a protected page to /signup on a zero-User instance', async () => {
    const res = await proxy(requestFor('/trips'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/signup');
  });

  it('redirects an unauthenticated root request to /signup on a zero-User instance -- bootstrap wins over Guest root landing', async () => {
    const res = await proxy(requestFor('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/signup');
  });

  it('lets an unauthenticated root request through once a User exists (Guest landing, added for single-Trip-at-a-time deployments)', async () => {
    await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });

    const res = await proxy(requestFor('/'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns a 401 JSON error envelope for an unauthenticated protected API path', async () => {
    const res = await proxy(requestFor('/api/v1/trips'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it.each(['/login', '/signup', '/api/v1/auth'])(
    'passes through the public path %s without requiring a session',
    async (pathname) => {
      const res = await proxy(requestFor(pathname));
      expect(res.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('passes through a protected page for a request carrying a valid session cookie', async () => {
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    const { token } = await issueSession(user.id);

    const res = await proxy(requestFor('/trips', { cookie: `trails_session=${token}` }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  // spec-guest-access, FR-28: proxy.ts's new allowlist. It only decides "is
  // an anonymous visitor even allowed to reach this route shape at all" --
  // it never looks up Trip.visibility, so these assertions are deliberately
  // "the request reaches the page" (NextResponse.next()) vs "redirected to
  // /login", never a 404 (that decision belongs to lib/viewer.ts, called by
  // the page itself -- covered by tests/viewer.test.ts and the live
  // Playwright/curl pass, not here).
  describe('Guest-eligible page allowlist (FR-28)', () => {
    const TRIP_ID = '11111111-1111-4111-8111-111111111111';
    const ENTRY_ID = '22222222-2222-4222-8222-222222222222';

    it.each([
      `/trips/${TRIP_ID}/overview`,
      `/trips/${TRIP_ID}/timeline`,
      `/trips/${TRIP_ID}/entries/${ENTRY_ID}`,
      `/trips/${TRIP_ID}/blog`,
      `/trips/${TRIP_ID}/blog/${ENTRY_ID}`,
    ])('passes through unauthenticated request for allowlisted path %s (Public-Trip-allowed shape)', async (pathname) => {
      const res = await proxy(requestFor(pathname));
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    // proxy.ts lets the request through regardless of the Trip's actual
    // visibility -- a Private Trip's five allowlisted URLs still reach the
    // page here (which is what 404s them itself, per the spec's Intent).
    it.each([
      `/trips/${TRIP_ID}/overview`,
      `/trips/${TRIP_ID}/timeline`,
      `/trips/${TRIP_ID}/entries/${ENTRY_ID}`,
      `/trips/${TRIP_ID}/blog`,
      `/trips/${TRIP_ID}/blog/${ENTRY_ID}`,
    ])(
      'passes through unauthenticated request for allowlisted path %s even for a Private Trip (proxy.ts never looks up visibility)',
      async (pathname) => {
        await testPrisma().trip.create({
          data: {
            id: TRIP_ID,
            name: 'Secret Trip',
            startDate: new Date('2026-08-01T00:00:00.000Z'),
            endDate: new Date('2026-08-20T00:00:00.000Z'),
            timezone: 'Asia/Bangkok',
            visibility: 'PRIVATE',
          },
        });
        const res = await proxy(requestFor(pathname));
        expect(res.headers.get('x-middleware-next')).toBe('1');
      },
    );

    it.each([
      `/trips/${TRIP_ID}/entries/new`,
      `/trips/${TRIP_ID}/budget`,
      `/trips/${TRIP_ID}/sections`,
      `/trips/${TRIP_ID}/ideas`,
      `/trips/${TRIP_ID}/checklists`,
      `/trips/${TRIP_ID}/important-info`,
      `/trips/${TRIP_ID}/documents`,
      `/trips/${TRIP_ID}/travel-mode`,
      `/trips/${TRIP_ID}`,
    ])('redirects an unauthenticated request for non-allowlisted path %s to /login', async (pathname) => {
      await testPrisma().user.create({
        data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
      });
      const res = await proxy(requestFor(pathname));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/login');
    });

    it('does not treat a non-UUID tripId segment as Guest-eligible', async () => {
      await testPrisma().user.create({
        data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
      });
      const res = await proxy(requestFor('/trips/not-a-uuid/overview'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/login');
    });
  });

  // spec-tags-links-photos, FR-3/FR-28: the one disclosed /api/v1/**
  // exception -- GET /api/v1/photos/{uuid}/file only. Every other Photo
  // route (and every Attachment/Tag/Link route) stays exactly as strict as
  // before -- these assertions are "reaches the route handler" vs "401",
  // never a visibility decision (that's the route's own job, covered by
  // tests/integration/photos-route.test.ts).
  describe('Guest-eligible API GET exception (FR-3/FR-28, Photo file only)', () => {
    const PHOTO_ID = '33333333-3333-4333-8333-333333333333';

    function requestForMethod(pathname: string, method: string) {
      return new NextRequest(`http://localhost${pathname}`, { method });
    }

    it('passes through an unauthenticated GET to the Photo file route', async () => {
      const res = await proxy(requestForMethod(`/api/v1/photos/${PHOTO_ID}/file`, 'GET'));
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('still 401s a non-GET method on the same path (e.g. a hypothetical DELETE)', async () => {
      const res = await proxy(requestForMethod(`/api/v1/photos/${PHOTO_ID}/file`, 'DELETE'));
      expect(res.status).toBe(401);
    });

    it.each([
      '/api/v1/photos',
      `/api/v1/photos/${PHOTO_ID}`,
      `/api/v1/photos/${PHOTO_ID}/primary`,
      `/api/v1/attachments/${PHOTO_ID}/file`,
      '/api/v1/tags',
      '/api/v1/links',
    ])('still 401s an unauthenticated GET to %s (the exception is scoped to Photo file only)', async (pathname) => {
      const res = await proxy(requestForMethod(pathname, 'GET'));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // spec-push-notifications: the second disclosed /api/v1/** exception --
  // POST/DELETE /api/v1/push/subscriptions only, so a Guest reading a
  // Public Trip's Blog can approve (and revoke) notifications with no
  // session. Same "reaches the route handler" vs "401" assertions as the
  // Photos block above -- what an anonymous subscription may ever be told
  // is a send-time decision (lib/push.ts's selectAudience, covered by
  // tests/push.test.ts), never inferred from getting through here.
  describe('Guest-eligible push subscribe exception (spec-push-notifications)', () => {
    function requestForMethod(pathname: string, method: string) {
      return new NextRequest(`http://localhost${pathname}`, { method });
    }

    it.each(['POST', 'DELETE'])(
      'passes through an unauthenticated %s to the push subscriptions route',
      async (method) => {
        const res = await proxy(requestForMethod('/api/v1/push/subscriptions', method));
        expect(res.headers.get('x-middleware-next')).toBe('1');
      },
    );

    it('still 401s a GET on the same path (there is no read surface)', async () => {
      const res = await proxy(requestForMethod('/api/v1/push/subscriptions', 'GET'));
      expect(res.status).toBe(401);
    });

    it.each(['/api/v1/push', '/api/v1/push/subscriptions/extra'])(
      'still 401s an unauthenticated POST to %s (the exception is that exact path only)',
      async (pathname) => {
        const res = await proxy(requestForMethod(pathname, 'POST'));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.code).toBe('UNAUTHORIZED');
      },
    );
  });
});
