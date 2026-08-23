// FR-22/FR-23, spec-budget: query-time aggregation of every TimelineEntry
// carrying an Expense (non-null expenseAmount), grouped by currency (AD-3:
// per-currency subtotals only -- no cross-currency conversion, no combined
// total) with optional Entry Type and Section filters. Pure, DB-free
// functions -- the page (app/(web)/trips/[tripId]/budget/page.tsx) queries
// Prisma and calls these; same split as lib/ideas.ts's filterIdeas. No new
// Prisma model, no cached/denormalized total anywhere (AD-3's "Always"
// boundary) -- this recomputes from the raw Entry rows on every call.

import { sectionIndexForDateKey, type SectionRange } from '@/lib/timeline';
import { entryEndpointDateKey } from '@/lib/trip-status';

export interface BudgetEntryInput {
  id: string;
  entryType: string;
  title: string;
  startAt: Date;
  // spec-timeline-ux-and-timezone (correction): NULL for every type but
  // Transport -- see TimelineEntry.startTimezone's own schema comment.
  startTimezone: string | null;
  // Both required here -- the caller (the page) only ever passes rows it
  // already queried with `expenseAmount: { not: null }`, and FR-22's "both
  // or neither" rule (lib/entry-types/shared-fields.schema.ts's
  // hasExpensePair) means expenseCurrency is never null when
  // expenseAmount isn't. An Entry with no Expense recorded (expenseAmount:
  // null) is excluded entirely upstream -- never represented here as a $0
  // line item (I/O matrix: "Entry with no Expense").
  expenseAmount: number;
  expenseCurrency: string;
  expensePaymentStatus: string | null;
  expensePaymentNote: string | null;
}

export interface BudgetSectionInput extends SectionRange {
  id: string;
}

export interface BudgetLineItem extends BudgetEntryInput {
  // `null` when the Entry's own start date falls on no Section's range --
  // same "gap day" concept the Timeline already renders, just attributed
  // per-Entry instead of per-day.
  sectionId: string | null;
}

export interface BudgetCurrencyGroup {
  currency: string;
  total: number;
  // Sum of just the line items whose expensePaymentStatus reads as
  // "Unpaid" -- user-reported: "budget view should separate them more to
  // see the total of unpaid." expensePaymentStatus stays free text
  // server-side, so this matches case-insensitively rather than assuming
  // every row was written through the new Paid/Unpaid dropdown.
  unpaidTotal: number;
  lineItems: BudgetLineItem[];
}

export interface BudgetFilters {
  entryType?: string | null;
  sectionId?: string | null;
}

/**
 * AD-2: "Sections have no foreign key from anything; membership is
 * computed by timezone-localized date, not stored." Reuses
 * `sectionIndexForDateKey` -- the exact containment check
 * `buildTimelineDays` (lib/timeline.ts) uses for the Timeline's per-day
 * Section bands -- rather than reimplementing it, so Budget's notion of
 * "which Section does this Entry belong to" can never drift from the
 * Timeline's. Per AD-2's multi-day-entry attribution rule, only the
 * Entry's own `startAt` anchor date is used (its literal calendar date --
 * an Entry's own recorded time is never re-localized through any timezone,
 * see dateTimeField's comment) -- an Entry is never attributed to more than
 * one Section.
 */
export function deriveLineItems(
  entries: BudgetEntryInput[],
  sections: BudgetSectionInput[],
): BudgetLineItem[] {
  return entries.map((entry) => {
    const dateKey = entryEndpointDateKey(entry.startAt, entry.startTimezone);
    const sectionIndex = sectionIndexForDateKey(dateKey, sections);
    return {
      ...entry,
      sectionId: sectionIndex === null ? null : sections[sectionIndex].id,
    };
  });
}

/** Entry Type / Section filters, applied to already-derived line items. */
export function filterLineItems(lineItems: BudgetLineItem[], filters: BudgetFilters): BudgetLineItem[] {
  return lineItems.filter((item) => {
    if (filters.entryType && item.entryType !== filters.entryType) return false;
    if (filters.sectionId && item.sectionId !== filters.sectionId) return false;
    return true;
  });
}

/**
 * Per-currency subtotals (AD-3: "no cross-currency conversion or forced
 * single total in v1") -- one group per distinct `expenseCurrency` present
 * in `lineItems`, sorted by currency code so rendering order is stable.
 */
export function groupByCurrency(lineItems: BudgetLineItem[]): BudgetCurrencyGroup[] {
  const groups = new Map<string, BudgetLineItem[]>();
  for (const item of lineItems) {
    const list = groups.get(item.expenseCurrency) ?? [];
    list.push(item);
    groups.set(item.expenseCurrency, list);
  }
  return [...groups.entries()]
    .map(([currency, items]) => ({
      currency,
      total: items.reduce((sum, item) => sum + item.expenseAmount, 0),
      unpaidTotal: items
        .filter((item) => item.expensePaymentStatus?.trim().toLowerCase() === 'unpaid')
        .reduce((sum, item) => sum + item.expenseAmount, 0),
      lineItems: items,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Convenience wrapper composing derive -> filter -> group for the page. */
export function aggregateBudget(
  entries: BudgetEntryInput[],
  sections: BudgetSectionInput[],
  filters: BudgetFilters,
): BudgetCurrencyGroup[] {
  return groupByCurrency(filterLineItems(deriveLineItems(entries, sections), filters));
}
