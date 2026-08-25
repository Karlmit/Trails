import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { aggregateBudget, type BudgetEntryInput } from '@/lib/budget';
import { timelineVisibleEntryWhere, entryDetailHref } from '@/lib/entry-types';
import { isUuid } from '@/lib/uuid';
import { BudgetFilters } from '@/components/BudgetFilters';

interface PageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ entryType?: string; sectionId?: string }>;
}

// FR-22/FR-23, spec-budget: aggregated read-only view of every TimelineEntry
// on this Trip carrying an Expense. AD-3: computed fresh on every request
// (no materialized view, no cached total) -- a plain Prisma query into
// lib/budget.ts's pure aggregation, same "Server Component reads Prisma
// directly" read path as Timeline/Ideas. Guest/public access (FR-28) isn't
// built yet at all; when it is, AD-3 requires Budget to stay structurally
// excluded from that surface rather than filtered into it.
export default async function BudgetPage({ params, searchParams }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const { entryType, sectionId } = await searchParams;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      sections: { orderBy: { startDate: 'asc' } },
      timelineEntries: {
        // AD-10: exclude Draft Blog Posts the same way the Timeline does
        // (timelineVisibleEntryWhere() -- the one shared predicate, not
        // reimplemented here), AND'd with "has a recorded Expense." An
        // Entry with `expenseAmount: null` is excluded entirely, never
        // shown as a $0 line item (I/O matrix).
        where: { ...timelineVisibleEntryWhere(), expenseAmount: { not: null } },
        orderBy: { startAt: 'asc' },
        // AD-3's "lean, query-time read" intent -- only the columns
        // lib/budget.ts and this page actually use, not every Location/
        // Contact/booking-reference field TimelineEntry carries.
        select: {
          id: true,
          entryType: true,
          title: true,
          startAt: true,
          startTimezone: true,
          expenseAmount: true,
          expenseCurrency: true,
          expensePaymentStatus: true,
          expensePaymentNote: true,
        },
      },
    },
  });
  if (!trip) notFound();

  // FR-22's "amount+currency travel together or not at all" rule
  // (lib/entry-types/shared-fields.schema.ts's hasExpensePair) means
  // expenseCurrency is never null when expenseAmount isn't -- the `filter`
  // below is a defensive belt-and-suspenders, not an expected path.
  const budgetEntries: BudgetEntryInput[] = trip.timelineEntries
    .filter((entry) => entry.expenseAmount !== null && entry.expenseCurrency !== null)
    .map((entry) => ({
      id: entry.id,
      entryType: entry.entryType,
      title: entry.title,
      startAt: entry.startAt,
      startTimezone: entry.startTimezone,
      expenseAmount: Number(entry.expenseAmount),
      expenseCurrency: entry.expenseCurrency as string,
      expensePaymentStatus: entry.expensePaymentStatus,
      expensePaymentNote: entry.expensePaymentNote,
    }));

  const groups = aggregateBudget(budgetEntries, trip.sections, {
    entryType,
    sectionId,
  });
  const lineItemCount = groups.reduce((sum, group) => sum + group.lineItems.length, 0);

  const t = await getTranslations('tripBudget');
  const tShared = await getTranslations('shared');
  const tEntries = await getTranslations('tripEntries');
  // expensePaymentStatus stays a free-text column (see EntryForm.tsx's own
  // comment) storing the literal English word "Paid"/"Unpaid" -- translate
  // just those two known values, leave any other legacy free text as-is.
  const paymentStatusLabel = (value: string) =>
    value === 'Paid' ? tEntries('paymentStatusPaid') : value === 'Unpaid' ? tEntries('paymentStatusUnpaid') : value;

  return (
    <main className="page">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{t('pageTitle')}</h2>
      </div>
      <p className="text-soft">{t('pageDescription')}</p>

      <BudgetFilters
        tripId={tripId}
        sections={trip.sections.map((section) => ({ id: section.id, name: section.name }))}
        entryType={entryType}
        sectionId={sectionId}
      />

      {budgetEntries.length === 0 ? (
        <div className="empty-state">{t('emptyState')}</div>
      ) : lineItemCount === 0 ? (
        <div className="empty-state">{t('emptyStateFiltered')}</div>
      ) : (
        <div className="stack">
          {groups.map((group) => (
            <div key={group.currency} className="card stack">
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{group.currency}</h3>
                <span className="text-soft">
                  {t('total', { amount: group.total.toFixed(2), currency: group.currency })}
                  {group.unpaidTotal > 0 && (
                    <>
                      {' · '}
                      <strong>
                        {t('unpaid', { amount: group.unpaidTotal.toFixed(2), currency: group.currency })}
                      </strong>
                    </>
                  )}
                </span>
              </div>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {group.lineItems.map((item) => (
                  <div key={item.id} className="row-between">
                    <div className="stack" style={{ gap: 0 }}>
                      <Link href={entryDetailHref(tripId, item.entryType, item.id)}>{item.title}</Link>
                      <span className="text-soft">
                        {tShared(`entryType.${item.entryType}`)}
                        {item.expensePaymentStatus ? ` · ${paymentStatusLabel(item.expensePaymentStatus)}` : ''}
                        {item.expensePaymentNote ? ` · ${item.expensePaymentNote}` : ''}
                      </span>
                    </div>
                    <span>
                      {item.expenseAmount.toFixed(2)} {item.expenseCurrency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
