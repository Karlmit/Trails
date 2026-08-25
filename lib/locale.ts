import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';

export const SUPPORTED_LOCALES = ['sv', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'sv';
export const LOCALE_COOKIE_NAME = 'trails_locale';

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

/**
 * The priority order itself, as a pure function so it's unit-testable
 * without a live session/DB: a signed-in User's own stored preference always
 * wins; a Guest/pre-login visitor falls back to a cookie (set client-side
 * from the Settings form); otherwise Swedish.
 */
export function pickLocale(userLocale: AppLocale | null, cookieLocale: string | undefined): AppLocale {
  if (userLocale) return userLocale;
  if (isAppLocale(cookieLocale)) return cookieLocale;
  return DEFAULT_LOCALE;
}

export async function resolveLocale(): Promise<AppLocale> {
  const user = await getSessionUser();
  const store = await cookies();
  return pickLocale((user?.locale as AppLocale) ?? null, store.get(LOCALE_COOKIE_NAME)?.value);
}
