// Timeline entry-dot/pill colors -- deliberately distinct from
// lib/section-colors.ts's palette (Section bands vs. Entry markers must
// stay visually distinguishable, per the I/O matrix's "not overlapping the
// Section rail" rendering rule). References the same DESIGN.md custom
// properties as section-colors.ts's solid palette, just a different subset/
// order so an Entry pill never reads as "another Section band."
const ENTRY_TYPE_COLORS: Record<string, string> = {
  STAY: 'var(--color-brand-accent)',
  TRANSPORT: 'var(--color-brand-uplift)',
  ACTIVITY: 'var(--color-brand)',
  NOTE: 'var(--color-text-soft)',
};

export function entryTypeColor(entryType: string): string {
  return ENTRY_TYPE_COLORS[entryType] ?? 'var(--color-text-soft)';
}
