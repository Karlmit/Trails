import { describe, expect, it } from 'vitest';
import { pickLocale } from '@/lib/locale';

// Multi-language support: the priority order a signed-in User's stored
// preference > Guest cookie > Swedish default -- unit-tested directly
// against the pure decision function, independent of any live
// session/cookie/DB read (that's covered separately by a live check).
describe('pickLocale', () => {
  it("a signed-in User's stored locale wins over any cookie", () => {
    expect(pickLocale('en', 'sv')).toBe('en');
  });

  it('falls back to the cookie when there is no signed-in User', () => {
    expect(pickLocale(null, 'en')).toBe('en');
  });

  it('falls back to Swedish when there is no User and no cookie', () => {
    expect(pickLocale(null, undefined)).toBe('sv');
  });

  it('falls back to Swedish when the cookie holds an unsupported value', () => {
    expect(pickLocale(null, 'de')).toBe('sv');
  });
});
