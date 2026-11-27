import { NextResponse, type NextRequest } from 'next/server';
import { Errors } from '@/lib/api-errors';
import { getUserFromApiRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

function readerCountry(headers: Headers): string {
  const header = process.env.BLOG_VIEW_COUNTRY_HEADER?.trim();
  const code = header && /^[\w-]+$/.test(header) ? headers.get(header)?.trim().toUpperCase() : null;
  return code && /^[A-Z]{2}$/.test(code) && countryNames.of(code) ? code : 'ZZ';
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return Errors.forbidden();
  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Blog post not found');
  const signedIn = (await getUserFromApiRequest(request)) !== null;
  const country = readerCountry(request.headers);

  // Check publication and guest visibility in the same statement as the
  // atomic counter increment. Only the country and aggregate are stored.
  const updated = await prisma.$executeRaw`
    WITH counted AS (
      INSERT INTO "blog_view_counts" ("entry_id", "country_code", "views")
      SELECT entry."id", ${country}, 1
      FROM "timeline_entries" AS entry
      JOIN "trips" AS trip ON trip."id" = entry."trip_id"
      WHERE entry."id" = ${entryId}::uuid
        AND entry."entry_type" = 'BLOG_POST'
        AND entry."published_at" IS NOT NULL
        AND (${signedIn} OR (trip."visibility" = 'PUBLIC' AND NOT entry."is_private"))
      FOR SHARE OF entry, trip
      ON CONFLICT ("entry_id", "country_code")
      DO UPDATE SET "views" = "blog_view_counts"."views" + 1
      RETURNING "entry_id"
    )
    INSERT INTO "blog_daily_view_counts" ("entry_id", "day", "views")
    SELECT "entry_id", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1
    FROM counted
    ON CONFLICT ("entry_id", "day")
    DO UPDATE SET "views" = "blog_daily_view_counts"."views" + 1
  `;

  if (!updated) return Errors.notFound('Blog post not found');
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await getUserFromApiRequest(request))) return Errors.unauthorized();
  const { entryId } = await params;
  if (!isUuid(entryId)) return Errors.notFound('Blog post not found');

  const post = await prisma.timelineEntry.findFirst({
    where: { id: entryId, entryType: 'BLOG_POST' },
    select: {
      blogViewCounts: {
        select: { countryCode: true, views: true },
        orderBy: [{ views: 'desc' }, { countryCode: 'asc' }],
      },
    },
  });
  if (!post) return Errors.notFound('Blog post not found');

  return NextResponse.json({
    totalViews: post.blogViewCounts.reduce((total, country) => total + country.views, 0),
    countries: post.blogViewCounts,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
