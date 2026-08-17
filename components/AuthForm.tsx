'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
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
          setError('Signup is closed. Redirecting to login…');
          setTimeout(() => router.push('/login'), 1200);
          return;
        }
        setError(body?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 380 }}>
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="username">Username</label>
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
        <label htmlFor="password">Password</label>
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
        {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
