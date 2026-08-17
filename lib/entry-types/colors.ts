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
  // spec-blog: only ever rendered here once Published (AD-10) -- a Draft
  // never reaches this function, since it never reaches the Timeline.
  // Gold is deliberately not used (DESIGN.md reserves it for the Trip
  // Active-status badge's own ceremony moment, not a general accent).
  BLOG_POST: 'var(--color-brand-deep)',
};

export function entryTypeColor(entryType: string): string {
  return ENTRY_TYPE_COLORS[entryType] ?? 'var(--color-text-soft)';
}
