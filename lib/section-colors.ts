// Sections carry no color field of their own (FR-5: name + start/end date
// only, "no item-assignment field of any kind") -- the color band is a
// pure rendering concern, deterministically cycled from the tiered brand
// palette (DESIGN.md). Gold is deliberately excluded: it's reserved for
// the one ceremonial moment (the Active Trip current-position marker), not
// general-purpose Section coloring.
// Four entries, matching DESIGN.md's four distinct tiered greens exactly --
// no repeated hue. Past a Trip's 4th concurrent Section the cycle repeats
// (index % length), which is an acceptable v1 limit rather than inventing
// a 5th color not in the design system.
const PALETTE = [
  'rgba(0, 98, 65, 0.16)', // brand
  'rgba(0, 117, 74, 0.14)', // brand-accent
  'rgba(43, 81, 72, 0.16)', // brand-uplift
  'rgba(30, 57, 50, 0.12)', // brand-deep
];

export function sectionColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

// The Timeline graph column's rail/node coloring (spec-timeline-ux-and-
// timezone) needs a fully-opaque counterpart to the translucent band
// colors above -- a thin rail or an 8px dot reads as noise at 12-28%
// alpha. Same hue order as PALETTE (including its index-4 repeat), just
// referencing the solid DESIGN.md/globals.css custom properties directly
// instead of a literal rgba -- no new colors introduced.
const SOLID_PALETTE = [
  'var(--color-brand)',
  'var(--color-brand-accent)',
  'var(--color-brand-uplift)',
  'var(--color-brand-deep)',
];

export function sectionColorSolid(index: number): string {
  return SOLID_PALETTE[index % SOLID_PALETTE.length];
}

// spec-sections-color-emoji: a curated set of 8 additional swatches a User
// can explicitly pick for one Section (color-swatch picker, not a free hex
// input -- Boundaries: "Ask First" on that). Distinct from PALETTE/
// SOLID_PALETTE above (the auto-cycled-by-index fallback, unchanged, still
// used when `Section.color` is null) -- chosen to stay legible with dark
// text overlaid at a similar translucency to PALETTE, be visually distinct
// from each other and from the reserved gold (--color-gold, DESIGN.md) and
// from --color-brand/-accent (already used by the fallback palette above)
// and --color-danger (so a Section never reads as an error state).
//
// `value` is the exact string persisted on `Section.color` and the single
// source of truth lib/validation.ts's server-side membership check imports
// from (SECTION_COLOR_VALUES below) -- the client never sends a free hex
// value, only one of these curated `value`s or null. `background` is the
// translucent variant used for the Timeline's color-block band (same
// alpha range as PALETTE); `solid` is the fully-opaque variant used for the
// graph column's rail/node, same "solid counterpart" reasoning as
// SOLID_PALETTE's own comment above.
export interface SectionColorSwatch {
  value: string;
  background: string;
  solid: string;
}

export const SECTION_COLOR_PALETTE: SectionColorSwatch[] = [
  { value: '#3d6fb4', background: 'rgba(61, 111, 180, 0.16)', solid: '#3d6fb4' }, // ocean blue
  { value: '#5b57a3', background: 'rgba(91, 87, 163, 0.16)', solid: '#5b57a3' }, // indigo
  { value: '#8a4f9e', background: 'rgba(138, 79, 158, 0.16)', solid: '#8a4f9e' }, // violet
  { value: '#b3467e', background: 'rgba(179, 70, 126, 0.16)', solid: '#b3467e' }, // rose
  { value: '#c9633f', background: 'rgba(201, 99, 63, 0.16)', solid: '#c9633f' }, // coral
  { value: '#2b8a94', background: 'rgba(43, 138, 148, 0.16)', solid: '#2b8a94' }, // teal
  { value: '#8a6240', background: 'rgba(138, 98, 64, 0.16)', solid: '#8a6240' }, // sand
  { value: '#5f6b75', background: 'rgba(95, 107, 117, 0.16)', solid: '#5f6b75' }, // slate
];

/** The exact set of persistable `Section.color` values -- lib/validation.ts's single source of truth. */
export const SECTION_COLOR_VALUES: string[] = SECTION_COLOR_PALETTE.map((swatch) => swatch.value);

/** Looks up a custom Section color's translucent band variant, or `undefined` if `color` isn't a curated value (defensive -- validation should prevent this). */
export function sectionCustomColorBand(color: string): string | undefined {
  return SECTION_COLOR_PALETTE.find((swatch) => swatch.value === color)?.background;
}

/** Looks up a custom Section color's solid rail/node variant, or `undefined` if `color` isn't a curated value. */
export function sectionCustomColorSolid(color: string): string | undefined {
  return SECTION_COLOR_PALETTE.find((swatch) => swatch.value === color)?.solid;
}

// spec-sections-color-emoji: ~24-30 travel/location-relevant emoji, shown
// as a clickable grid (emoji picker) -- curated, not free text (same "Ask
// First" boundary as the color palette above). Single source of truth for
// both SectionManager's picker and lib/validation.ts's membership check.
export const SECTION_EMOJI_OPTIONS: string[] = [
  '✈️', '🏖️', '🏔️', '🏙️', '🚗', '🚢', '⛺', '🎉',
  '📍', '🗺️', '🍜', '🥾', '🏛️', '🌴', '❄️', '🏝️',
  '🚆', '🚌', '🛶', '🎿', '🏕️', '🛥️', '🚁', '🧳',
  '🍽️', '🌅', '🎭', '🛍️',
];
