'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

// FR-30, spec-admin-users: mirrors AuthForm's controlled-input/fetch/
// error-banner shape, but this form never navigates away -- a successful
// create just clears the fields and calls router.refresh() so the Server
// Component list on the same page picks up the new account immediately,
// with no page reload (spec's Acceptance Criteria) -- the account showing
// up in the list below is itself the success confirmation, same as
// ChecklistCard's add-item form.
export function CreateUserForm() {
  const t = useTranslations('errors');
  const tAdmin = useTranslations('admin');
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
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, body?.error?.message) ?? tAdmin('createAccountFailed'));
        return;
      }

      setUsername('');
      setPassword('');
      router.refresh();
    } catch {
      setError(tAdmin('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack" style={{ maxWidth: 380 }}>
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="new-user-username">{tAdmin('usernameLabel')}</label>
        <input
          id="new-user-username"
          name="username"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          maxLength={64}
        />
      </div>
      <div className="field">
        <label htmlFor="new-user-password">{tAdmin('passwordLabel')}</label>
        <input
          id="new-user-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          maxLength={256}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? tAdmin('creating') : tAdmin('createAccount')}
      </button>
    </form>
  );
}
