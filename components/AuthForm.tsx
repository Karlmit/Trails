'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
  const t = useTranslations('errors');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth', {
        method: mode === 'login' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 410) {
          setError(tAuth('signupClosedRedirecting'));
          setTimeout(() => router.push('/login'), 1200);
          return;
        }
        setError(translateApiError(t, body?.error?.message) ?? tAuth('genericError'));
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError(tAuth('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 380 }}>
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="username">{tAuth('usernameLabel')}</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
        />
      </div>
      <div className="field">
        <label htmlFor="password">{tAuth('passwordLabel')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
        {submitting ? tAuth('pleaseWait') : mode === 'login' ? tAuth('logIn') : tAuth('createAccount')}
      </button>
    </form>
  );
}
