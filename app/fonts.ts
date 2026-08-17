import localFont from 'next/font/local';

// DESIGN.md / Consistency Conventions: custom typefaces load via
// `next/font/local`, never `next/font/google`. Trails doesn't have a
// licensed proprietary typeface (DESIGN.md's source system uses one), so
// per DESIGN.md's own documented substitute guidance ("Known Gaps" /
// "Note on Font Substitutes": Inter is the recommended open-source stand-in
// with the same tight tracking), Inter ships as a locally self-hosted font
// file rather than the disallowed `next/font/google` loader.
export const appFont = localFont({
  src: [
    { path: './fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/inter-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/inter-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-trails',
  display: 'swap',
});
