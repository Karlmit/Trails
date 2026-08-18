import { describe, expect, it } from 'vitest';
import {
  SECTION_COLOR_PALETTE,
  SECTION_COLOR_VALUES,
  sectionCustomColorBand,
  sectionCustomColorSolid,
} from '@/lib/section-colors';

// spec-sections-color-emoji: pure lookup helpers behind a Section's custom
// color (as opposed to sectionColor/sectionColorSolid's index-based
// auto-cycled fallback, which is unchanged and already covered elsewhere).
describe('SECTION_COLOR_VALUES', () => {
  it('is the exact set of curated palette values, same order as SECTION_COLOR_PALETTE', () => {
    expect(SECTION_COLOR_VALUES).toEqual(SECTION_COLOR_PALETTE.map((swatch) => swatch.value));
    expect(SECTION_COLOR_VALUES.length).toBe(8);
  });
});

describe('sectionCustomColorBand', () => {
  it('returns the translucent background variant for a curated value', () => {
    for (const swatch of SECTION_COLOR_PALETTE) {
      expect(sectionCustomColorBand(swatch.value)).toBe(swatch.background);
    }
  });

  it('returns undefined for a value not in the curated set (defensive)', () => {
    expect(sectionCustomColorBand('#ffffff')).toBeUndefined();
    expect(sectionCustomColorBand('not-a-color')).toBeUndefined();
    expect(sectionCustomColorBand('')).toBeUndefined();
  });
});

describe('sectionCustomColorSolid', () => {
  it('returns the solid variant for a curated value', () => {
    for (const swatch of SECTION_COLOR_PALETTE) {
      expect(sectionCustomColorSolid(swatch.value)).toBe(swatch.solid);
    }
  });

  it('returns undefined for a value not in the curated set (defensive)', () => {
    expect(sectionCustomColorSolid('#ffffff')).toBeUndefined();
    expect(sectionCustomColorSolid('not-a-color')).toBeUndefined();
    expect(sectionCustomColorSolid('')).toBeUndefined();
  });
});
