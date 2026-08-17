import { describe, expect, it } from 'vitest';
import { filterTimezones } from '@/components/TimezoneSelect';

// spec-timeline-ux-and-timezone: pure filter predicate behind the
// TimezoneSelect combobox, tested independent of React/DOM.
describe('filterTimezones', () => {
  const zones = ['UTC', 'Europe/Stockholm', 'Asia/Bangkok', 'Asia/Tokyo', 'America/New_York'];

  it('matches case-insensitively as a substring', () => {
    expect(filterTimezones(zones, 'bangk')).toEqual(['Asia/Bangkok']);
    expect(filterTimezones(zones, 'BANGK')).toEqual(['Asia/Bangkok']);
  });

  it('matches on any part of the zone name, not just the prefix', () => {
    expect(filterTimezones(zones, 'asia')).toEqual(['Asia/Bangkok', 'Asia/Tokyo']);
  });

  it('returns an empty array for no match', () => {
    expect(filterTimezones(zones, 'nowhere')).toEqual([]);
  });

  it('orders by the common-zone shortlist when the query is empty, uncommon zones following', () => {
    const withUncommon = [...zones, 'Pacific/Fiji'];
    const result = filterTimezones(withUncommon, '');
    // All 5 `zones` entries happen to be common zones -- they lead, in
    // COMMON_TIMEZONES order (America/New_York before Asia/Bangkok there),
    // not input order; the one uncommon zone trails.
    expect(result).toEqual([
      'UTC',
      'Europe/Stockholm',
      'America/New_York',
      'Asia/Bangkok',
      'Asia/Tokyo',
      'Pacific/Fiji',
    ]);
    expect(new Set(result)).toEqual(new Set(withUncommon));
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterTimezones(zones, '  tokyo  ')).toEqual(['Asia/Tokyo']);
  });
});
