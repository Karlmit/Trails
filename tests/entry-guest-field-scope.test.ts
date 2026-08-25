import { describe, expect, it } from 'vitest';
import { stripEntryFieldsForGuest } from '@/lib/entry-types';

// spec-guest-field-scope: `stripEntryFieldsForGuest` is the one place a
// serialized TimelineEntry's Guest-hidden fields are nulled out, applied by
// app/(web)/trips/[tripId]/entries/[entryId]/page.tsx before the entry is
// ever passed as a prop to the Client Component that renders it. Unit-tested
// directly against the spec's frozen I/O matrix, independent of any live
// page render (covered separately by a live curl/Playwright pass).

const FULL_ENTRY = {
  id: 'entry-1',
  tripId: 'trip-1',
  entryType: 'ACTIVITY',
  subtype: 'TOUR',
  title: 'Museum Visit',
  description: 'A very nice museum',
  startAt: '2026-08-03T14:00:00.000Z',
  endAt: '2026-08-03T16:00:00.000Z',
  locationName: 'City Museum',
  locationAddress: '1 Museum Way',
  locationMapLink: 'https://maps.example.com/museum',
  bookingReference: 'BOOK123',
  website: 'https://museum.example.com',
  bookedVia: 'Viator',
  expenseAmount: 42,
  expenseCurrency: 'USD',
  expensePaymentStatus: 'PAID',
  expensePaymentNote: 'Paid in advance',
  contactName: 'Jane Doe',
  contactPhone: '+1 555 0100',
  contactEmail: 'jane@example.com',
  notes: 'Bring comfortable shoes',
  postTripNotes: 'Would visit again',
  typeDetails: {},
  isPrivate: false,
};

describe('stripEntryFieldsForGuest', () => {
  it('nulls out every Guest-hidden field', () => {
    const result = stripEntryFieldsForGuest(FULL_ENTRY);
    expect(result.description).toBeNull();
    expect(result.bookingReference).toBeNull();
    expect(result.website).toBeNull();
    expect(result.bookedVia).toBeNull();
    expect(result.expenseAmount).toBeNull();
    expect(result.expenseCurrency).toBeNull();
    expect(result.expensePaymentStatus).toBeNull();
    expect(result.expensePaymentNote).toBeNull();
    expect(result.contactName).toBeNull();
    expect(result.contactPhone).toBeNull();
    expect(result.contactEmail).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.postTripNotes).toBeNull();
  });

  it('leaves Title/Start/End/Location/entryType/subtype/isPrivate untouched', () => {
    const result = stripEntryFieldsForGuest(FULL_ENTRY);
    expect(result.id).toBe(FULL_ENTRY.id);
    expect(result.title).toBe(FULL_ENTRY.title);
    expect(result.startAt).toBe(FULL_ENTRY.startAt);
    expect(result.endAt).toBe(FULL_ENTRY.endAt);
    expect(result.locationName).toBe(FULL_ENTRY.locationName);
    expect(result.locationAddress).toBe(FULL_ENTRY.locationAddress);
    expect(result.locationMapLink).toBe(FULL_ENTRY.locationMapLink);
    expect(result.entryType).toBe(FULL_ENTRY.entryType);
    expect(result.subtype).toBe(FULL_ENTRY.subtype);
    expect(result.isPrivate).toBe(FULL_ENTRY.isPrivate);
  });

  it('does not mutate the input object', () => {
    const before = JSON.stringify(FULL_ENTRY);
    stripEntryFieldsForGuest(FULL_ENTRY);
    expect(JSON.stringify(FULL_ENTRY)).toBe(before);
  });

  it('returns a new object, not the same reference', () => {
    const result = stripEntryFieldsForGuest(FULL_ENTRY);
    expect(result).not.toBe(FULL_ENTRY);
  });

  it('leaves an already-null field null (no Location set)', () => {
    const noLocation = { ...FULL_ENTRY, locationName: null, locationAddress: null, locationMapLink: null };
    const result = stripEntryFieldsForGuest(noLocation);
    expect(result.locationName).toBeNull();
    expect(result.locationAddress).toBeNull();
    expect(result.locationMapLink).toBeNull();
  });

  it('resets typeDetails to {} so a Stay/Transport-only field never reaches a Guest', () => {
    const stayEntry = { ...FULL_ENTRY, entryType: 'STAY', typeDetails: { roomInfo: 'Room 204, code 8842' } };
    expect(stripEntryFieldsForGuest(stayEntry).typeDetails).toEqual({});

    const transportEntry = {
      ...FULL_ENTRY,
      entryType: 'TRANSPORT',
      typeDetails: { baggageInfo: 'Carousel 3', flights: [{ seat: '14A', gate: 'B12', terminal: 'T2', flightNumber: 'LH400' }] },
    };
    expect(stripEntryFieldsForGuest(transportEntry).typeDetails).toEqual({});
  });
});
