import { describe, expect, it } from 'vitest';
import {
  dateTimeField,
  isDateOrderValid,
  isValidTimezone,
  sectionCreateSchema,
  tripCreateSchema,
  tripUpdateSchema,
} from '@/lib/validation';

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Item 3: Route Handlers merge a partial PATCH onto the existing row's
// dates before calling this, so a one-field update can't invert the pair.
describe('isDateOrderValid', () => {
  it('accepts endDate on or after startDate', () => {
    expect(isDateOrderValid(dateOnly('2026-08-01'), dateOnly('2026-08-10'))).toBe(true);
    expect(isDateOrderValid(dateOnly('2026-08-01'), dateOnly('2026-08-01'))).toBe(true);
  });

  it('rejects endDate before startDate', () => {
    expect(isDateOrderValid(dateOnly('2026-08-10'), dateOnly('2026-08-01'))).toBe(false);
  });
});

// spec-timeline-ux-and-timezone: an Entry's own recorded startAt/endAt are
// the traveler's literal wall-clock digits, stored verbatim regardless of
// the server's own runtime timezone -- see the field's own comment.
describe('dateTimeField', () => {
  it('treats a zone-less datetime string (the shape every date/time picker submits) as UTC', () => {
    expect(dateTimeField.parse('2026-08-05T15:00').toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('treats a zone-less datetime string with seconds as UTC too', () => {
    expect(dateTimeField.parse('2026-08-05T15:00:30').toISOString()).toBe('2026-08-05T15:00:30.000Z');
  });

  it('leaves an explicitly-zoned string unchanged', () => {
    expect(dateTimeField.parse('2026-08-05T15:00:00.000+02:00').toISOString()).toBe('2026-08-05T13:00:00.000Z');
    expect(dateTimeField.parse('2026-08-05T15:00:00.000Z').toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('rejects an unparsable string', () => {
    expect(() => dateTimeField.parse('not-a-date')).toThrow();
  });
});

describe('isValidTimezone', () => {
  it('accepts a real IANA identifier', () => {
    expect(isValidTimezone('Asia/Bangkok')).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });
});

describe('tripCreateSchema (FR-1)', () => {
  const base = {
    name: 'Thailand',
    startDate: '2026-08-01',
    endDate: '2026-08-20',
    timezone: 'Asia/Bangkok',
  };

  it('accepts a minimal valid Trip', () => {
    expect(() => tripCreateSchema.parse(base)).not.toThrow();
  });

  it('rejects a missing name', () => {
    const { name, ...rest } = base;
    expect(() => tripCreateSchema.parse(rest)).toThrow();
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      tripCreateSchema.parse({ ...base, startDate: '2026-08-20', endDate: '2026-08-01' }),
    ).toThrow();
  });

  it('rejects an invalid timezone', () => {
    expect(() => tripCreateSchema.parse({ ...base, timezone: 'Nowhere/Land' })).toThrow();
  });

  it('accepts end date equal to start date (single-day Trip)', () => {
    expect(() =>
      tripCreateSchema.parse({ ...base, startDate: '2026-08-01', endDate: '2026-08-01' }),
    ).not.toThrow();
  });

  it('accepts a valid http(s) coverImage URL', () => {
    expect(() =>
      tripCreateSchema.parse({ ...base, coverImage: 'https://example.com/cover.jpg' }),
    ).not.toThrow();
  });

  it('rejects a javascript: coverImage URL', () => {
    expect(() =>
      tripCreateSchema.parse({ ...base, coverImage: 'javascript:alert(1)' }),
    ).toThrow();
  });

  it('rejects a malformed coverImage URL', () => {
    expect(() => tripCreateSchema.parse({ ...base, coverImage: 'not a url' })).toThrow();
  });
});

describe('tripUpdateSchema', () => {
  it('allows a partial update with just a name', () => {
    expect(() => tripUpdateSchema.parse({ name: 'New name' })).not.toThrow();
  });

  it('still rejects an end date before a provided start date', () => {
    expect(() =>
      tripUpdateSchema.parse({ startDate: '2026-08-20', endDate: '2026-08-01' }),
    ).toThrow();
  });
});

describe('sectionCreateSchema (FR-5)', () => {
  const base = {
    tripId: '11111111-1111-4111-8111-111111111111',
    name: 'Phuket',
    startDate: '2026-08-03',
    endDate: '2026-08-07',
  };

  it('accepts a valid Section', () => {
    expect(() => sectionCreateSchema.parse(base)).not.toThrow();
  });

  it('rejects a non-UUID tripId', () => {
    expect(() => sectionCreateSchema.parse({ ...base, tripId: 'not-a-uuid' })).toThrow();
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      sectionCreateSchema.parse({ ...base, startDate: '2026-08-07', endDate: '2026-08-03' }),
    ).toThrow();
  });
});
