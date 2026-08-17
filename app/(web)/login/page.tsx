import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getSessionUser } from '@/lib/auth';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/');

  return (
    <main className="page" style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1>Log in</h1>
        <p className="text-soft">Welcome back to Trails.</p>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
