'use client';

import { useRef } from 'react';

// spec-entry-fields-datepickers: shared end-date auto-fill pattern, used by
// NewTripForm/EditTripForm, SectionManager's create+edit forms, and
// EntryForm. While untouched, End keeps following every Start change; the
// instant a User picks their own End value, it stops following for the rest
// of that form instance -- a real, deliberate choice is never silently
// overwritten. `hasInitialEnd` seeds "already touched" whenever the form
// loads with an existing End value already stored (edit mode, or an
// Idea-conversion seed carrying one) -- so opening an edit form never lets
// auto-fill fire, even before any field is touched.
export interface AutoEndDate {
  /** True once End has been explicitly set by the User (or the form
   *  instance was seeded with an already-stored End) -- while true, Start
   *  changes never touch End. */
  touched: () => boolean;
  /** Call from the End field's own onChange when the resulting value is
   *  non-empty -- a real, complete End value counts as "touched," even if
   *  it happens to still match Start. Do NOT call this for an incomplete/
   *  abandoned edit that collapsed back to empty (review-caught: e.g.
   *  DateTimeInput's hour-picked-but-no-date-yet case) -- that isn't a
   *  deliberate End choice, and permanently disarming auto-fill over it
   *  would strand the User with no End and no auto-fill safety net. */
  markTouched: () => void;
  /** Re-arms (or permanently disarms) auto-fill for a new form instance --
   *  e.g. SectionManager opening a different Section's inline edit form, or
   *  a create form resetting its fields after submit/cancel. Pass whether
   *  the *new* instance's End is already non-empty. */
  reset: (hasEnd: boolean) => void;
}

/**
 * Pure, framework-independent state machine behind `useAutoEndDate` --
 * exported for unit testing independent of React (this codebase has no
 * component/hook-rendering test setup, see tests/use-auto-end-date.test.ts).
 * The hook below is a thin `useRef` wrapper that keeps exactly one instance
 * alive for the lifetime of the component it's called from.
 */
export class AutoEndDateState implements AutoEndDate {
  private isTouched: boolean;

  constructor(hasInitialEnd: boolean) {
    this.isTouched = hasInitialEnd;
  }

  touched = (): boolean => this.isTouched;

  markTouched = (): void => {
    this.isTouched = true;
  };

  reset = (hasEnd: boolean): void => {
    this.isTouched = hasEnd;
  };
}

export function useAutoEndDate(hasInitialEnd: boolean): AutoEndDate {
  const stateRef = useRef<AutoEndDateState | null>(null);
  if (!stateRef.current) {
    stateRef.current = new AutoEndDateState(hasInitialEnd);
  }
  return stateRef.current;
}
