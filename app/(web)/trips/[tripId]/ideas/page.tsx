import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeIdea } from '@/lib/serializers';
import { distinctWeatherTags, filterIdeas, PRIORITY_LABELS } from '@/lib/ideas';
import { isUuid } from '@/lib/uuid';
import { IdeaForm } from '@/components/IdeaForm';
import { IdeaCard } from '@/components/IdeaCard';

interface PageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ priority?: string; weatherTag?: string }>;
}

// FR-16/FR-17, spec-ideas: list + create + priority/weather-tag filters.
// The filter control is a plain `<form method="get">` (native browser
// navigation via query string, no client JS) -- the Trip's Ideas render as
// a Server Component reading Prisma directly (architecture's read path),
// filtered by `filterIdeas` (lib/ideas.ts, the same pure predicate
// GET /api/v1/ideas applies) against `?priority=&weatherTag=`.
export default async function IdeasPage({ params, searchParams }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const { priority, weatherTag } = await searchParams;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { ideas: { orderBy: { createdAt: 'asc' } } },
  });
  if (!trip) notFound();

  // spec-tags-links-photos: FR-15's "thumbnail in list views" -- one query
  // for every Idea's Cover Photo (if any), attached below by ownerId.
  const primaryPhotos = await prisma.photo.findMany({
    where: { ownerType: 'IDEA', ownerId: { in: trip.ideas.map((idea) => idea.id) }, isPrimary: true },
    select: { id: true, ownerId: true },
  });
  const primaryPhotoByIdeaId = new Map(primaryPhotos.map((photo) => [photo.ownerId, photo.id]));

  const allIdeas = trip.ideas.map((idea) => ({
    ...serializeIdea(idea),
    primaryPhotoId: primaryPhotoByIdeaId.get(idea.id) ?? null,
  }));
  const tagOptions = distinctWeatherTags(allIdeas);
  const ideas = filterIdeas(allIdeas, { priority, weatherTag });

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Ideas</h2>
      </div>
      <p className="text-soft">
        Unconfirmed candidates for this Trip. Convert one once it&rsquo;s booked to add it to the Timeline.
      </p>

      <form method="get" className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="idea-filter-priority">Priority</label>
          <select id="idea-filter-priority" name="priority" defaultValue={priority ?? ''}>
            <option value="">All</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="idea-filter-tag">Weather tag</label>
          <select id="idea-filter-tag" name="weatherTag" defaultValue={weatherTag ?? ''}>
            <option value="">All</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-outline">
          Filter
        </button>
        {(priority || weatherTag) && (
          <a href={`/trips/${tripId}/ideas`} className="text-soft">
            Clear filters
          </a>
        )}
      </form>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <IdeaForm tripId={tripId} />
      </div>

      {ideas.length === 0 ? (
        <div className="empty-state">
          {allIdeas.length === 0
            ? 'No Ideas yet. Add one above.'
            : 'No Ideas match this filter.'}
        </div>
      ) : (
        <div className="stack">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </main>
  );
}
