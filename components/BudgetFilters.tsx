// spec-budget: Entry Type / Section filter controls for the Budget page --
// same plain `<form method="get">` (native browser navigation via query
// string, no client JS) GET-form filter pattern the Ideas page uses
// (app/(web)/trips/[tripId]/ideas/page.tsx's `?priority=&weatherTag=`
// form), just factored into its own component per this spec's Code Map.

import { ENTRY_TYPE_LABELS } from '@/lib/entry-types/labels';

// Only these three Entry Types ever carry Expense fields at all --
// Note (FR-14) and Blog Post (FR-18) schemas have no expenseAmount/
// expenseCurrency field, so offering them here would be a filter option
// that can never match anything. See lib/entry-types/note.schema.ts and
// blog-post.schema.ts. Labels come from the canonical ENTRY_TYPE_LABELS
// (lib/entry-types/labels.ts) rather than a second hardcoded map, so the
// two can't drift.
export const BUDGET_ENTRY_TYPES = ['STAY', 'TRANSPORT', 'ACTIVITY'] as const;

export interface BudgetFiltersProps {
  tripId: string;
  sections: Array<{ id: string; name: string }>;
  entryType?: string;
  sectionId?: string;
}

export function BudgetFilters({ tripId, sections, entryType, sectionId }: BudgetFiltersProps) {
  const hasActiveFilter = Boolean(entryType || sectionId);

  return (
    <form method="get" className="row" style={{ marginBottom: 'var(--space-4)' }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="budget-filter-entry-type">Entry Type</label>
        <select id="budget-filter-entry-type" name="entryType" defaultValue={entryType ?? ''}>
          <option value="">All</option>
          {BUDGET_ENTRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ENTRY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="budget-filter-section">Section</label>
        <select id="budget-filter-section" name="sectionId" defaultValue={sectionId ?? ''}>
          <option value="">All</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-outline">
        Filter
      </button>
      {hasActiveFilter && (
        <a href={`/trips/${tripId}/budget`} className="text-soft">
          Clear filters
        </a>
      )}
    </form>
  );
}
