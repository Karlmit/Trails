// Sections carry no color field of their own (FR-5: name + start/end date
// only, "no item-assignment field of any kind") -- the color band is a
// pure rendering concern, deterministically cycled from the tiered brand
// palette (DESIGN.md). Gold is deliberately excluded: it's reserved for
// the one ceremonial moment (the Active Trip current-position marker), not
// general-purpose Section coloring.
const PALETTE = [
  'rgba(0, 98, 65, 0.16)', // brand
  'rgba(0, 117, 74, 0.14)', // brand-accent
  'rgba(43, 81, 72, 0.16)', // brand-uplift
  'rgba(30, 57, 50, 0.12)', // brand-deep
  'rgba(0, 98, 65, 0.28)', // brand, denser repeat
];

export function sectionColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
