import { NextResponse, type NextRequest } from 'next/server';
import { Errors } from '@/lib/api-errors';
import { getUserFromApiRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/uuid';

export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  if (!(await getUserFromApiRequest(request))) return Errors.unauthorized();
  const { tripId } = await params;
  if (!isUuid(tripId)) return Errors.notFound('Trip not found');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const earliest = new Date(`${today}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 89);

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      timelineEntries: {
        where: {
          entryType: 'BLOG_POST',
          OR: [{ publishedAt: { not: null } }, { blogViewCounts: { some: {} } }],
        },
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          startAt: true,
          blogViewCounts: { select: { countryCode: true, views: true } },
          blogDailyViewCounts: {
            where: { day: { gte: earliest, lte: new Date(`${today}T00:00:00Z`) } },
            orderBy: { day: 'asc' },
            select: { day: true, views: true },
          },
        },
      },
    },
  });
  if (!trip) return Errors.notFound('Trip not found');

  const countryCounts = new Map<string, number>();
  const posts = trip.timelineEntries.map((entry) => {
    let totalViews = 0;
    for (const { countryCode, views } of entry.blogViewCounts) {
      totalViews += views;
      countryCounts.set(countryCode, (countryCounts.get(countryCode) ?? 0) + views);
    }
    return {
      id: entry.id,
      title: entry.title,
      date: entry.startAt.toISOString().slice(0, 10),
      totalViews,
      daily: entry.blogDailyViewCounts.map(({ day, views }) => ({ date: day.toISOString().slice(0, 10), views })),
    };
  });
  const countries = Array.from(countryCounts, ([countryCode, views]) => ({ countryCode, views }))
    .sort((a, b) => b.views - a.views || a.countryCode.localeCompare(b.countryCode));

  return NextResponse.json({
    today, posts, countries, totalViews: posts.reduce((total, post) => total + post.totalViews, 0),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
