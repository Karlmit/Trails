// Display labels for Entry Type/Entry Subtype values, kept separate from
// the *.schema.ts files' refine/error-message logic so a form component
// only needs "what to show the user," not the validation shape itself.

import { ACTIVITY_SUBTYPES } from './activity.schema';
import { STAY_SUBTYPES } from './stay.schema';
import { TRANSPORT_MODES } from './transport.schema';

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  STAY: 'Stay',
  TRANSPORT: 'Transport',
  ACTIVITY: 'Activity',
  NOTE: 'Note',
};

export const SUBTYPES_BY_ENTRY_TYPE: Record<string, readonly string[]> = {
  STAY: STAY_SUBTYPES,
  TRANSPORT: TRANSPORT_MODES,
  ACTIVITY: ACTIVITY_SUBTYPES,
  NOTE: [],
};

const RAW_LABELS: Record<string, string> = {
  HOTEL: 'Hotel',
  HOSTEL: 'Hostel',
  RESORT: 'Resort',
  APARTMENT: 'Apartment',
  VILLA: 'Villa',
  GUESTHOUSE: 'Guesthouse',
  STAY_OTHER: 'Other',
  FLIGHT: 'Flight',
  TRAIN: 'Train',
  FERRY: 'Ferry',
  BUS: 'Bus',
  CAR: 'Car',
  TAXI: 'Taxi',
  TRANSFER: 'Transfer',
  TRANSPORT_OTHER: 'Other',
  TOUR: 'Tour',
  RESTAURANT: 'Restaurant',
  ATTRACTION: 'Attraction',
  EVENT: 'Event',
  BEACH: 'Beach',
  HIKE: 'Hike',
  MUSEUM: 'Museum',
  SHOPPING: 'Shopping',
  NIGHTLIFE: 'Nightlife',
  ACTIVITY_OTHER: 'Other',
};

export function subtypeLabel(value: string): string {
  return RAW_LABELS[value] ?? value;
}
