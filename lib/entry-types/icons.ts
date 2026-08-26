// Timeline entry-chip icons -- one glyph per Entry Subtype (FR-11/12/13's
// STAY_SUBTYPES/TRANSPORT_MODES/ACTIVITY_SUBTYPES) plus a per-Entry-Type
// fallback for the two subtype-less types (Note, Blog Post) and the rare
// case of a Stay/Transport/Activity row with no subtype set. Subtype
// strings are unique across all three enums, so one flat map is enough --
// no need to key on (entryType, subtype) pairs.
const SUBTYPE_ICONS: Record<string, string> = {
  HOTEL: '🏨',
  HOSTEL: '🛏️',
  RESORT: '🏝️',
  APARTMENT: '🏢',
  VILLA: '🏡',
  GUESTHOUSE: '🏠',
  STAY_OTHER: '🏘️',
  FLIGHT: '✈️',
  TRAIN: '🚆',
  FERRY: '⛴️',
  BUS: '🚌',
  CAR: '🚗',
  TAXI: '🚕',
  TRANSFER: '🚐',
  TRANSPORT_OTHER: '🧭',
  TOUR: '🗺️',
  RESTAURANT: '🍽️',
  ATTRACTION: '🎡',
  EVENT: '🎉',
  BEACH: '🏖️',
  HIKE: '🥾',
  MUSEUM: '🏛️',
  SHOPPING: '🛍️',
  NIGHTLIFE: '🍸',
  ACTIVITY_OTHER: '📍',
};

const ENTRY_TYPE_ICONS: Record<string, string> = {
  STAY: '🏨',
  TRANSPORT: '🚗',
  ACTIVITY: '📍',
  NOTE: '📝',
  BLOG_POST: '📖',
};

export function entryTypeIcon(entryType: string): string {
  return ENTRY_TYPE_ICONS[entryType] ?? '📍';
}

export function entryIcon(entryType: string, subtype: string | null): string {
  if (subtype && SUBTYPE_ICONS[subtype]) return SUBTYPE_ICONS[subtype];
  return entryTypeIcon(entryType);
}
