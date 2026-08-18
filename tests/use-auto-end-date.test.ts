import { describe, expect, it } from 'vitest';
import { AutoEndDateState } from '@/lib/hooks/useAutoEndDate';

// spec-entry-fields-datepickers: pure state machine behind useAutoEndDate,
// tested independent of React/DOM (this codebase has no component/hook
// rendering test setup, see tests/timezone-select.test.ts's own precedent
// of testing a form-input's pure logic directly).
describe('AutoEndDateState', () => {
  it('starts untouched when the form has no initial End', () => {
    const state = new AutoEndDateState(false);
    expect(state.touched()).toBe(false);
  });

  it('starts already touched when the form is seeded with an existing End (edit mode)', () => {
    const state = new AutoEndDateState(true);
    expect(state.touched()).toBe(true);
  });

  it('becomes touched once markTouched is called, and stays touched', () => {
    const state = new AutoEndDateState(false);
    state.markTouched();
    expect(state.touched()).toBe(true);
    // Still touched even if markTouched is called again -- never reverts.
    state.markTouched();
    expect(state.touched()).toBe(true);
  });

  it('reset() re-arms auto-fill for a fresh form instance', () => {
    const state = new AutoEndDateState(false);
    state.markTouched();
    expect(state.touched()).toBe(true);

    state.reset(false);
    expect(state.touched()).toBe(false);
  });

  it('reset(true) permanently disarms auto-fill for the new instance (e.g. a different Section being edited)', () => {
    const state = new AutoEndDateState(false);
    state.reset(true);
    expect(state.touched()).toBe(true);
  });
});
