import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/AuthForm';
import { getSessionUser, hasAnyUsers } from '@/lib/auth';

// FR-29/AD-7: the signup route is only reachable while zero Users exist.
// Once the first account exists, this page redirects to /login -- it never
// re-opens (the authoritative gate is the 410 on PUT /api/v1/auth; this is
// the page-level mirror so the form never even renders).
export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect('/');

  const bootstrapped = await hasAnyUsers();
  if (bootstrapped) redirect('/login');

  const t = await getTranslations('auth');

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1>{t('signupTitle')}</h1>
        <p className="text-soft">{t('signupSubtitle')}</p>
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
