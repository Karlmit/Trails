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
