import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { LanguageSettingsForm } from '@/components/LanguageSettingsForm';

// Multi-language support: proxy.ts's requireAuth catch-all already
// guarantees a valid session reaches this page (it is not in
// PUBLIC_PAGE_PATHS/GUEST_ELIGIBLE_PATH) -- the redirect below only covers
// the theoretical race of a session expiring between proxy.ts's check and
// this render.
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  const t = await getTranslations('settings');

  return (
    <main className="page">
      <h1>{t('title')}</h1>
      <LanguageSettingsForm currentLocale={user.locale} />
    </main>
  );
}
