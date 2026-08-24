import { describe, expect, it } from 'vitest';
import { distinctCategories, filterIdeas } from '@/lib/ideas';

// FR-16, spec-ideas: "unit for filtering" -- pure, DB-free.
describe('filterIdeas', () => {
  const ideas = [
    { id: '1', priority: 'MUST_DO', sectionId: 'sec-1', category: 'Food', weatherSuitability: 'INDOOR' },
    { id: '2', priority: 'WOULD_LIKE', sectionId: 'sec-2', category: 'Sights', weatherSuitability: 'OUTDOOR' },
    { id: '3', priority: 'MAYBE', sectionId: 'sec-1', category: 'Food', weatherSuitability: 'OUTDOOR' },
    { id: '4', priority: 'MAYBE', sectionId: null, category: null, weatherSuitability: 'EITHER' },
  ];

  it('returns every Idea when no filters are given', () => {
    expect(filterIdeas(ideas, {})).toHaveLength(4);
  });

  it('filters by priority only', () => {
    const result = filterIdeas(ideas, { priority: 'MAYBE' });
    expect(result.map((i) => i.id)).toEqual(['3', '4']);
  });

  it('filters by sectionId only', () => {
    const result = filterIdeas(ideas, { sectionId: 'sec-1' });
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('filters by category only', () => {
    const result = filterIdeas(ideas, { category: 'Food' });
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('filters by weatherSuitability only', () => {
    const result = filterIdeas(ideas, { weatherSuitability: 'OUTDOOR' });
    expect(result.map((i) => i.id)).toEqual(['2', '3']);
  });

  it('filters by priority, sectionId, category, and weatherSuitability combined', () => {
    const result = filterIdeas(ideas, { priority: 'MAYBE', sectionId: 'sec-1', category: 'Food', weatherSuitability: 'OUTDOOR' });
    expect(result.map((i) => i.id)).toEqual(['3']);
  });

  it('returns an empty array (not an error) when nothing matches', () => {
    const result = filterIdeas(ideas, { category: 'Nonexistent' });
    expect(result).toEqual([]);
  });

  it('ignores empty-string/null filter values (treated as "no filter")', () => {
    const result = filterIdeas(ideas, { priority: '', sectionId: null, category: '' });
    expect(result).toHaveLength(4);
  });
});

describe('distinctCategories', () => {
  it('returns every distinct category, sorted, with no duplicates', () => {
    const ideas = [{ category: 'Sights' }, { category: 'Food' }, { category: 'Food' }, { category: null }];
    expect(distinctCategories(ideas)).toEqual(['Food', 'Sights']);
  });

  it('returns an empty array when no Idea has a category', () => {
    expect(distinctCategories([{ category: null }])).toEqual([]);
  });
});
