import { describe, expect, it } from 'vitest';
import {
  aggregateBudget,
  deriveLineItems,
  filterLineItems,
  groupByCurrency,
  type BudgetEntryInput,
  type BudgetSectionInput,
} from '@/lib/budget';

// spec-budget: "unit tests covering the I/O matrix" -- pure, DB-free, same
// split as lib/ideas.ts's filterIdeas (the page queries Prisma; this does
// the grouping/filtering).

function entry(overrides: Partial<BudgetEntryInput> & { id: string }): BudgetEntryInput {
  return {
    entryType: 'STAY',
    title: 'Untitled',
    startAt: new Date('2026-08-03T10:00:00.000Z'),
    expenseAmount: 100,
    expenseCurrency: 'USD',
    expensePaymentStatus: null,
    expensePaymentNote: null,
    ...overrides,
  };
}

describe('aggregateBudget / groupByCurrency (I/O matrix: mixed currencies)', () => {
  it('produces one subtotal per currency, no combined/converted total', () => {
    const entries = [
      entry({ id: '1', expenseAmount: 1000, expenseCurrency: 'THB' }),
      entry({ id: '2', expenseAmount: 2500, expenseCurrency: 'THB' }),
      entry({ id: '3', expenseAmount: 50, expenseCurrency: 'USD' }),
    ];
    const groups = aggregateBudget(entries, [], 'UTC', {});

    expect(groups).toHaveLength(2);
    const thb = groups.find((g) => g.currency === 'THB');
    const usd = groups.find((g) => g.currency === 'USD');
    expect(thb?.total).toBe(3500);
    expect(thb?.lineItems.map((i) => i.id)).toEqual(['1', '2']);
    expect(usd?.total).toBe(50);
    expect(usd?.lineItems.map((i) => i.id)).toEqual(['3']);
    // No group carries a cross-currency combined total (AD-3) -- each
    // group's total only ever sums its own currency's line items.
    expect(groups.every((g) => g.total === g.lineItems.reduce((s, i) => s + i.expenseAmount, 0))).toBe(
      true,
    );
  });

  it('sorts currency groups by currency code for stable rendering order', () => {
    const entries = [
      entry({ id: '1', expenseCurrency: 'USD' }),
      entry({ id: '2', expenseCurrency: 'EUR' }),
      entry({ id: '3', expenseCurrency: 'THB' }),
    ];
    const groups = aggregateBudget(entries, [], 'UTC', {});
    expect(groups.map((g) => g.currency)).toEqual(['EUR', 'THB', 'USD']);
  });
});

describe('aggregateBudget (I/O matrix: no expenses recorded)', () => {
  it('returns an empty array (not a group with a $0 total) when there are no Expense-carrying Entries', () => {
    const groups = aggregateBudget([], [], 'UTC', {});
    expect(groups).toEqual([]);
  });
});

describe('filterLineItems (I/O matrix: filter by Entry Type)', () => {
  it('only counts the filtered Entry Type toward totals/line items', () => {
    const entries = [
      entry({ id: '1', entryType: 'STAY', expenseAmount: 100 }),
      entry({ id: '2', entryType: 'ACTIVITY', expenseAmount: 40 }),
      entry({ id: '3', entryType: 'STAY', expenseAmount: 60 }),
    ];
    const groups = aggregateBudget(entries, [], 'UTC', { entryType: 'STAY' });
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(160);
    expect(groups[0].lineItems.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('ignores an empty-string entryType filter (treated as "no filter")', () => {
    const items = [entry({ id: '1' })].map((e) => ({ ...e, sectionId: null }));
    expect(filterLineItems(items, { entryType: '' })).toHaveLength(1);
  });
});

describe('deriveLineItems / Section filter (I/O matrix: filter by Section, AD-2)', () => {
  // A Section's membership check must be the exact same date-containment
  // logic buildTimelineDays (lib/timeline.ts) uses -- verified here by
  // exercising deriveLineItems, which delegates to the shared
  // `sectionIndexForDateKey` rather than reimplementing it.
  const sections: BudgetSectionInput[] = [
    { id: 'sec-1', startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-05T00:00:00.000Z') },
    { id: 'sec-2', startDate: new Date('2026-08-06T00:00:00.000Z'), endDate: new Date('2026-08-10T00:00:00.000Z') },
  ];

  it("attributes an Entry to the Section containing its own start date", () => {
    const entries = [entry({ id: '1', startAt: new Date('2026-08-03T10:00:00.000Z') })];
    const [lineItem] = deriveLineItems(entries, sections, 'UTC');
    expect(lineItem.sectionId).toBe('sec-1');
  });

  it('leaves sectionId null for an Entry whose date falls in no Section (gap day)', () => {
    // Trip's own Section list has no coverage here even though a Trip may
    // exist across this date -- e.g. Aug 5 to Aug 6 could be a deliberate
    // gap between two legs.
    const gapSections: BudgetSectionInput[] = [
      { id: 'sec-1', startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-02T00:00:00.000Z') },
    ];
    const entries = [entry({ id: '1', startAt: new Date('2026-08-15T10:00:00.000Z') })];
    const [lineItem] = deriveLineItems(entries, gapSections, 'UTC');
    expect(lineItem.sectionId).toBeNull();
  });

  it('attributes a multi-day-looking Entry only to the Section containing its start anchor date, never more than one', () => {
    // AD-2: "a multi-day entry counts toward the Section (if any)
    // containing its start_at anchor date only." The Entry's own start
    // date (Aug 4) is in sec-1; the fact its title implies a longer stay
    // is irrelevant to lib/budget.ts, which only ever looks at startAt.
    const entries = [entry({ id: '1', startAt: new Date('2026-08-04T22:00:00.000Z') })];
    const [lineItem] = deriveLineItems(entries, sections, 'UTC');
    expect(lineItem.sectionId).toBe('sec-1');
  });

  it('only counts Entries whose date falls within the filtered Section toward the total', () => {
    const entries = [
      entry({ id: '1', startAt: new Date('2026-08-03T10:00:00.000Z'), expenseAmount: 100 }), // sec-1
      entry({ id: '2', startAt: new Date('2026-08-08T10:00:00.000Z'), expenseAmount: 250 }), // sec-2
    ];
    const groups = aggregateBudget(entries, sections, 'UTC', { sectionId: 'sec-1' });
    expect(groups).toHaveLength(1);
    expect(groups[0].lineItems.map((i) => i.id)).toEqual(['1']);
    expect(groups[0].total).toBe(100);
  });

  it("localizes an Entry's date to the Trip's own timezone (AD-8), not raw UTC", () => {
    // 2026-08-05T20:00:00Z is already 2026-08-06 03:00 in Asia/Bangkok
    // (UTC+7) -- so this Entry belongs to sec-2 (Aug 6-10) in the Trip's
    // own timezone, even though its raw UTC date (Aug 5) would put it in
    // sec-1 (Aug 1-5).
    const entries = [entry({ id: '1', startAt: new Date('2026-08-05T20:00:00.000Z') })];
    const [lineItem] = deriveLineItems(entries, sections, 'Asia/Bangkok');
    expect(lineItem.sectionId).toBe('sec-2');
  });
});

describe('Entry with no Expense (I/O matrix)', () => {
  it('is never represented as a $0 line item -- groupByCurrency only ever sums what it is given', () => {
    // lib/budget.ts's BudgetEntryInput.expenseAmount is required (a number,
    // never null) -- an Entry with no Expense is excluded upstream, at the
    // Prisma query in the page (`expenseAmount: { not: null }`), before it
    // ever reaches this module. This test just locks down that
    // groupByCurrency itself never synthesizes an extra $0 entry.
    const groups = groupByCurrency(
      deriveLineItems([entry({ id: '1', expenseAmount: 100 })], [], 'UTC'),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].lineItems).toHaveLength(1);
    expect(groups[0].total).toBe(100);
  });
});
