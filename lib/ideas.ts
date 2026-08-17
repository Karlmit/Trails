// FR-16: Ideas are filterable by Priority and by a single free-form weather
// tag. Pure, DB-free function so it's unit-testable on its own (per this
// spec's Tasks: "unit for filtering") -- both the GET /api/v1/ideas Route
// Handler and the Ideas page's server-rendered `?priority=&weatherTag=`
// filter form call this, so the predicate is defined exactly once.

export interface IdeaFilterInput {
  priority: string;
  weatherTags: string[];
}

export interface IdeaFilters {
  priority?: string | null;
  weatherTag?: string | null;
}

export function filterIdeas<T extends IdeaFilterInput>(ideas: T[], filters: IdeaFilters): T[] {
  return ideas.filter((idea) => {
    if (filters.priority && idea.priority !== filters.priority) return false;
    if (filters.weatherTag && !idea.weatherTags.includes(filters.weatherTag)) return false;
    return true;
  });
}

/** Every distinct weather tag across a Trip's Ideas, sorted, for building the filter form's tag options. */
export function distinctWeatherTags(ideas: { weatherTags: string[] }[]): string[] {
  const tags = new Set<string>();
  for (const idea of ideas) {
    for (const tag of idea.weatherTags) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

// Display labels, same split-from-schema-logic convention as
// lib/entry-types/labels.ts.
export const PRIORITY_LABELS: Record<string, string> = {
  MUST_DO: 'Must do',
  WOULD_LIKE: 'Would like',
  MAYBE: 'Maybe',
};

export const WEATHER_SUITABILITY_LABELS: Record<string, string> = {
  INDOOR: 'Indoor',
  OUTDOOR: 'Outdoor',
  EITHER: 'Either',
};
