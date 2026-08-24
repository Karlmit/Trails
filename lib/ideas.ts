// FR-16: Ideas are filterable by Priority, Section, Category, and Weather
// suitability. Pure, DB-free function so it's unit-testable on its own (per
// this spec's Tasks: "unit for filtering") -- both the GET /api/v1/ideas
// Route Handler and the Ideas page's server-rendered
// `?priority=&sectionId=&category=&weatherSuitability=` filter form call
// this, so the predicate is defined exactly once.

export interface IdeaFilterInput {
  priority: string;
  sectionId?: string | null;
  category?: string | null;
  weatherSuitability: string;
}

export interface IdeaFilters {
  priority?: string | null;
  sectionId?: string | null;
  category?: string | null;
  weatherSuitability?: string | null;
}

export function filterIdeas<T extends IdeaFilterInput>(ideas: T[], filters: IdeaFilters): T[] {
  return ideas.filter((idea) => {
    if (filters.priority && idea.priority !== filters.priority) return false;
    if (filters.sectionId && idea.sectionId !== filters.sectionId) return false;
    if (filters.category && idea.category !== filters.category) return false;
    if (filters.weatherSuitability && idea.weatherSuitability !== filters.weatherSuitability) return false;
    return true;
  });
}

/** Every distinct Category across a Trip's Ideas, sorted, for building the filter form's/create form's options. */
export function distinctCategories(ideas: { category: string | null }[]): string[] {
  const categories = new Set<string>();
  for (const idea of ideas) {
    if (idea.category) categories.add(idea.category);
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
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
