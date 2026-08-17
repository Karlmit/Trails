import { describe, expect, it } from 'vitest';
import { distinctWeatherTags, filterIdeas } from '@/lib/ideas';

// FR-16, spec-ideas: "unit for filtering" -- pure, DB-free.
describe('filterIdeas', () => {
  const ideas = [
    { id: '1', priority: 'MUST_DO', weatherTags: ['Rainy day'] },
    { id: '2', priority: 'WOULD_LIKE', weatherTags: ['Sunny weather'] },
    { id: '3', priority: 'MAYBE', weatherTags: ['Rainy day', 'Sunny weather'] },
    { id: '4', priority: 'MAYBE', weatherTags: [] },
  ];

  it('returns every Idea when no filters are given', () => {
    expect(filterIdeas(ideas, {})).toHaveLength(4);
  });

  it('filters by priority only', () => {
    const result = filterIdeas(ideas, { priority: 'MAYBE' });
    expect(result.map((i) => i.id)).toEqual(['3', '4']);
  });

  it('filters by weather tag only', () => {
    const result = filterIdeas(ideas, { weatherTag: 'Rainy day' });
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('filters by both priority and weather tag combined', () => {
    const result = filterIdeas(ideas, { priority: 'MAYBE', weatherTag: 'Rainy day' });
    expect(result.map((i) => i.id)).toEqual(['3']);
  });

  it('returns an empty array (not an error) when nothing matches', () => {
    const result = filterIdeas(ideas, { weatherTag: 'Snowy' });
    expect(result).toEqual([]);
  });

  it('ignores empty-string filter values (treated as "no filter")', () => {
    const result = filterIdeas(ideas, { priority: '', weatherTag: '' });
    expect(result).toHaveLength(4);
  });
});

describe('distinctWeatherTags', () => {
  it('returns every distinct tag, sorted, with no duplicates', () => {
    const ideas = [
      { weatherTags: ['Rainy day', 'Sunny weather'] },
      { weatherTags: ['Sunny weather'] },
      { weatherTags: [] },
    ];
    expect(distinctWeatherTags(ideas)).toEqual(['Rainy day', 'Sunny weather']);
  });

  it('returns an empty array when no Idea has any tag', () => {
    expect(distinctWeatherTags([{ weatherTags: [] }])).toEqual([]);
  });
});
