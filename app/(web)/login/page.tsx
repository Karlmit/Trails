import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/AuthForm';
import { getSessionUser } from '@/lib/auth';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/');

  const t = await getTranslations('auth');

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1>{t('loginTitle')}</h1>
        <p className="text-soft">{t('loginSubtitle')}</p>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
