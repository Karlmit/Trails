import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { serializeIdea } from '@/lib/serializers';
import { distinctCategories, filterIdeas, PRIORITY_LABELS, WEATHER_SUITABILITY_LABELS } from '@/lib/ideas';
import { sectionColorSolid, sectionCustomColorSolid } from '@/lib/section-colors';
import { isUuid } from '@/lib/uuid';
import { IdeaForm } from '@/components/IdeaForm';
import { IdeaCard, type IdeaCardLink } from '@/components/IdeaCard';

interface PageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ priority?: string; sectionId?: string; category?: string; weatherSuitability?: string }>;
}

// FR-16/FR-17, spec-ideas: list + create + priority/Section/Category/
// Weather-suitability filters. The filter control is a plain
// `<form method="get">` (native browser navigation via query string, no
// client JS) -- the Trip's Ideas render as a Server Component reading
// Prisma directly (architecture's read path), filtered by `filterIdeas`
// (lib/ideas.ts, the same pure predicate GET /api/v1/ideas applies) against
// `?priority=&sectionId=&category=&weatherSuitability=`.
//
// User-reported redesign ("the design is very much lacking ... the cover
// image is weirdly placed, the convert button is not matching the other
// buttons"): this view is the Trip's *shortlist* -- its job is comparing
// many candidates at a glance, which a full-width vertical stack of cards
// cannot do (six Ideas ran to ~4,000px). Three structural changes, see
// .design/PLAN.md:
//   1. A photo-led card grid instead of a stack, so candidates sit side by
//      side and the Cover Photo becomes the card rather than a footnote.
//   2. Grouped under each Section's own heading, in that Section's own
//      stored color/emoji (the same value the Timeline paints with) -- so
//      "which leg of the trip is this for" is answered once per group
//      instead of being repeated as a field on every card.
//   3. Links come from this query rather than a per-card client fetch.
//      LinkList self-fetches on mount, which was one round-trip per Idea
//      (plus one more for Photos) and a visible pop-in; in a grid of 20
//      that is 40 requests for data this Server Component is already
//      holding an open Prisma connection for.
export default async function IdeasPage({ params, searchParams }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const { priority, sectionId, category, weatherSuitability } = await searchParams;

  const t = await getTranslations('tripIdeas');

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      ideas: { orderBy: { createdAt: 'asc' } },
      sections: { orderBy: { startDate: 'asc' } },
    },
  });
  if (!trip) notFound();

  const sectionIndexById = new Map(trip.sections.map((section, index) => [section.id, index]));
  const UNSECTIONED_INDEX = trip.sections.length;

  const ideaIds = trip.ideas.map((idea) => idea.id);

  // spec-tags-links-photos: FR-15's "thumbnail in list views" -- every
  // Idea's Cover Photo (if any), attached below by ownerId. Now also counts
  // the Idea's other Photos: the card face deliberately shows only the
  // Cover (the old design rendered the Cover twice -- once as an 80px
  // `float: right` thumbnail, once again inside a full read-only
  // PhotoGallery under a `FOTON` label), so a card carrying more than one
  // Photo says so instead of silently hiding them.
  const photos = await prisma.photo.findMany({
    where: { ownerType: 'IDEA', ownerId: { in: ideaIds } },
    select: { id: true, ownerId: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });
  const coverPhotoByIdeaId = new Map<string, string>();
  const photoCountByIdeaId = new Map<string, number>();
  for (const photo of photos) {
    photoCountByIdeaId.set(photo.ownerId, (photoCountByIdeaId.get(photo.ownerId) ?? 0) + 1);
    // The query is already ordered isPrimary-first, so the first Photo seen
    // for an owner is its Cover -- or, for an Idea with Photos but no Cover
    // marked, its newest, which is what the User would expect to represent
    // it (and what the old design accidentally showed via the gallery).
    if (!coverPhotoByIdeaId.has(photo.ownerId)) coverPhotoByIdeaId.set(photo.ownerId, photo.id);
  }

  const links = await prisma.link.findMany({
    where: { ownerType: 'IDEA', ownerId: { in: ideaIds } },
    select: { id: true, ownerId: true, url: true, label: true },
    orderBy: { createdAt: 'asc' },
  });
  const linksByIdeaId = new Map<string, IdeaCardLink[]>();
  for (const link of links) {
    const list = linksByIdeaId.get(link.ownerId) ?? [];
    list.push({ id: link.id, url: link.url, label: link.label });
    linksByIdeaId.set(link.ownerId, list);
  }

  const allIdeas = trip.ideas.map((idea) => ({
    ...serializeIdea(idea),
    primaryPhotoId: coverPhotoByIdeaId.get(idea.id) ?? null,
    photoCount: photoCountByIdeaId.get(idea.id) ?? 0,
    links: linksByIdeaId.get(idea.id) ?? [],
  }));
  const categoryOptions = distinctCategories(allIdeas);
  const sectionOptions = trip.sections.map((s) => ({ id: s.id, name: s.name }));
  const hasActiveFilter = Boolean(priority || sectionId || category || weatherSuitability);

  const visibleIdeas = filterIdeas(allIdeas, { priority, sectionId, category, weatherSuitability });

  // Default sort: grouped by the Trip's own Section order, unsectioned
  // Ideas last -- same "no-section-is-a-real-group, not scattered" choice
  // the Android app's Ideas list makes (see its own IdeasScreen comment).
  // The grouping the old design left implicit in the sort order is now
  // rendered explicitly, so the sort itself only has to order the groups.
  const groups = [
    ...trip.sections.map((section, index) => ({
      key: section.id,
      name: section.name,
      emoji: section.emoji,
      color: (section.color && sectionCustomColorSolid(section.color)) ?? sectionColorSolid(index),
      ideas: visibleIdeas.filter((idea) => idea.sectionId === section.id),
    })),
    {
      key: 'unsectioned',
      name: t('noSectionOption'),
      emoji: null,
      // Unsectioned Ideas are a real group, not a color-coded leg of the
      // Trip -- a neutral rule keeps them from reading as a Section that
      // happens to be grey.
      color: 'rgba(0, 0, 0, 0.16)',
      ideas: visibleIdeas.filter(
        (idea) => !idea.sectionId || !sectionIndexById.has(idea.sectionId),
      ),
    },
  ].filter((group) => group.ideas.length > 0);

  return (
    <main className="page">
      <div className="ideas-header">
        <div>
          <h2 className="ideas-title">{t('title')}</h2>
          <p className="ideas-subtitle">{t('subtitle')}</p>
        </div>
        <IdeaForm
          mode="create"
          tripId={tripId}
          sections={sectionOptions}
          categoryOptions={categoryOptions}
        />
      </div>

      <form method="get" className="ideas-filters">
        <div className="ideas-filter">
          <label htmlFor="idea-filter-priority">{t('priorityLabel')}</label>
          <select id="idea-filter-priority" name="priority" defaultValue={priority ?? ''}>
            <option value="">{t('allOption')}</option>
            {Object.keys(PRIORITY_LABELS).map((value) => (
              <option key={value} value={value}>
                {t(`priority.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="ideas-filter">
          <label htmlFor="idea-filter-section">{t('sectionLabel')}</label>
          <select id="idea-filter-section" name="sectionId" defaultValue={sectionId ?? ''}>
            <option value="">{t('allOption')}</option>
            {trip.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ideas-filter">
          <label htmlFor="idea-filter-category">{t('categoryLabel')}</label>
          <select id="idea-filter-category" name="category" defaultValue={category ?? ''}>
            <option value="">{t('allOption')}</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="ideas-filter">
          <label htmlFor="idea-filter-weather">{t('weatherSuitabilityLabel')}</label>
          <select id="idea-filter-weather" name="weatherSuitability" defaultValue={weatherSuitability ?? ''}>
            <option value="">{t('allOption')}</option>
            {Object.keys(WEATHER_SUITABILITY_LABELS).map((value) => (
              <option key={value} value={value}>
                {t(`weatherSuitability.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="ideas-filter-actions">
          <button type="submit" className="btn btn-outline">
            {t('filterButton')}
          </button>
          {hasActiveFilter && (
            <a href={`/trips/${tripId}/ideas`} className="ideas-filter-clear">
              {t('clearFilters')}
            </a>
          )}
        </div>
      </form>

      {visibleIdeas.length === 0 ? (
        <div className="empty-state">
          {allIdeas.length === 0 ? t('emptyStateNoIdeas') : t('emptyStateNoMatch')}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="ideas-group">
            <h3 className="ideas-group-heading">
              {group.emoji ? (
                <span className="ideas-group-emoji" aria-hidden="true">
                  {group.emoji}
                </span>
              ) : (
                <span
                  className="ideas-group-marker"
                  style={{ background: group.color }}
                  aria-hidden="true"
                />
              )}
              <span className="ideas-group-name">{group.name}</span>
              <span className="ideas-group-rule" style={{ background: group.color }} aria-hidden="true" />
              <span className="ideas-group-count">{t('ideaCount', { count: group.ideas.length })}</span>
            </h3>
            <div className="ideas-grid">
              {group.ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  sections={sectionOptions}
                  categoryOptions={categoryOptions}
                  accentColor={group.color}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
