import { describe, expect, it } from 'vitest';
import { combineDateTime, splitDateTime } from '@/components/DateTimeInput';

// spec-entry-fields-datepickers: pure date/hour/minute-combining logic
// behind DateTimeInput, tested independent of the DOM (this codebase has no
// component-rendering test setup, see tests/timezone-select.test.ts's own
// precedent of testing a form-input's pure logic directly). This is the
// exact `YYYY-MM-DDTHH:mm` shape EntryForm already works with internally.
describe('combineDateTime', () => {
  it('combines a complete date/hour/minute selection', () => {
    expect(combineDateTime('2026-08-03', '14', '05')).toBe('2026-08-03T14:05');
  });

  it('zero-pads correctly at the boundaries (00 and 23/59)', () => {
    expect(combineDateTime('2026-08-03', '00', '00')).toBe('2026-08-03T00:00');
    expect(combineDateTime('2026-08-03', '23', '59')).toBe('2026-08-03T23:59');
  });

  it('returns empty string when only the date is chosen (no hour/minute yet)', () => {
    expect(combineDateTime('2026-08-03', '', '')).toBe('');
    expect(combineDateTime('2026-08-03', '14', '')).toBe('');
    expect(combineDateTime('2026-08-03', '', '05')).toBe('');
  });

  it('returns empty string when only hour/minute are chosen but no date', () => {
    expect(combineDateTime('', '14', '05')).toBe('');
  });

  it('returns empty string when nothing is chosen', () => {
    expect(combineDateTime('', '', '')).toBe('');
  });
});

describe('splitDateTime', () => {
  it('splits a complete YYYY-MM-DDTHH:mm value into its three parts', () => {
    expect(splitDateTime('2026-08-03T14:05')).toEqual({ date: '2026-08-03', hour: '14', minute: '05' });
  });

  it('returns all-empty parts for an empty string', () => {
    expect(splitDateTime('')).toEqual({ date: '', hour: '', minute: '' });
  });

  it('round-trips through combineDateTime', () => {
    const original = '2026-12-31T23:59';
    const { date, hour, minute } = splitDateTime(original);
    expect(combineDateTime(date, hour, minute)).toBe(original);
  });
});
