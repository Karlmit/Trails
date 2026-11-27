import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/v1/timeline-entries/[entryId]/views/route';
import { GET as getTripStatistics } from '@/app/api/v1/trips/[tripId]/blog-statistics/route';
import { issueSession } from '@/lib/session';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';

describe.skipIf(!hasTestDatabase)('blog view statistics', () => {
  let entryId: string;
  let tripId: string;
  let token: string;

  function request(method: string, headers?: HeadersInit) {
    return new NextRequest(`http://localhost/api/v1/timeline-entries/${entryId}/views`, { method, headers });
  }

  function params() {
    return { params: Promise.resolve({ entryId }) };
  }

  beforeEach(async () => {
    await resetDb();
    vi.stubEnv('BLOG_VIEW_COUNTRY_HEADER', 'x-test-country');
    const user = await testPrisma().user.create({
      data: { username: 'reader', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    token = (await issueSession(user.id)).token;
    const trip = await testPrisma().trip.create({
      data: {
        name: 'Test trip',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-30'),
        timezone: 'UTC',
        visibility: 'PUBLIC',
      },
    });
    tripId = trip.id;
    const entry = await testPrisma().timelineEntry.create({
      data: {
        tripId, entryType: 'BLOG_POST', title: 'Test post',
        startAt: new Date('2026-11-20'), publishedAt: new Date('2026-11-20'),
      },
    });
    entryId = entry.id;
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await testPrisma().$disconnect(); });

  it('aggregates concurrent view events and keeps statistics signed-in only', async () => {
    const auth = { authorization: `Bearer ${token}` };
    expect(await (await GET(request('GET', auth), params())).json())
      .toEqual({ totalViews: 0, countries: [] });
    const posts = await Promise.all([
      POST(request('POST', { 'x-test-country': 'se' }), params()),
      POST(request('POST', { 'x-test-country': 'SE' }), params()),
      POST(request('POST', { 'x-test-country': 'US', ...auth }), params()),
      POST(request('POST', { 'x-test-country': 'SE, US' }), params()),
    ]);
    expect(posts.map((response) => response.status)).toEqual([204, 204, 204, 204]);
    expect(await testPrisma().blogDailyViewCount.aggregate({ _sum: { views: true } }))
      .toEqual({ _sum: { views: 4 } });
    expect((await GET(request('GET'), params())).status).toBe(401);

    const stats = await GET(request('GET', auth), params());
    expect(stats.headers.get('cache-control')).toBe('private, no-store');
    expect(await stats.json()).toEqual({
      totalViews: 4,
      countries: [
        { countryCode: 'SE', views: 2 },
        { countryCode: 'US', views: 1 },
        { countryCode: 'ZZ', views: 1 },
      ],
    });
  });

  it('keeps older totals and limits trends to the latest 90 days', async () => {
    await testPrisma().blogViewCount.create({ data: { entryId, countryCode: 'SE', views: 23 } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const expired = new Date(today);
    expired.setUTCDate(expired.getUTCDate() - 90);
    await testPrisma().blogDailyViewCount.createMany({ data: [
      { entryId, day: today, views: 3 },
      { entryId, day: expired, views: 2 },
    ] });
    const tripParams = { params: Promise.resolve({ tripId }) };
    expect((await getTripStatistics(request('GET'), tripParams)).status).toBe(401);
    const response = await getTripStatistics(request('GET', { authorization: `Bearer ${token}` }), tripParams);
    const day = today.toISOString().slice(0, 10);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      today: day,
      totalViews: 23,
      countries: [{ countryCode: 'SE', views: 23 }],
      posts: [{ id: entryId, title: 'Test post', date: '2026-11-20', totalViews: 23, daily: [{ date: day, views: 3 }] }],
    });
  });

  it('honors post and trip visibility and excludes drafts and cross-site loads', async () => {
    expect((await POST(request('POST', { 'sec-fetch-site': 'cross-site' }), params())).status).toBe(403);
    await testPrisma().timelineEntry.update({ where: { id: entryId }, data: { isPrivate: true } });
    expect((await POST(request('POST'), params())).status).toBe(404);
    await testPrisma().timelineEntry.update({ where: { id: entryId }, data: { isPrivate: false } });
    await testPrisma().trip.update({ where: { id: tripId }, data: { visibility: 'PRIVATE' } });
    expect((await POST(request('POST'), params())).status).toBe(404);
    const auth = { authorization: `Bearer ${token}` };
    expect((await POST(request('POST', auth), params())).status).toBe(204);
    await testPrisma().timelineEntry.update({ where: { id: entryId }, data: { publishedAt: null } });
    expect((await POST(request('POST', auth), params())).status).toBe(404);
    expect(await testPrisma().blogViewCount.count()).toBe(1);
  });
});
