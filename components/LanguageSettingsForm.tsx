'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@prisma/client';

interface LanguageSettingsFormProps {
  currentLocale: Locale;
}

export function LanguageSettingsForm({ currentLocale }: LanguageSettingsFormProps) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(currentLocale);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleChange(next: Locale) {
    if (next === locale || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setLocale(next);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 380 }}>
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label>{t('languageLabel')}</label>
        <p className="text-soft" style={{ marginTop: 0 }}>
          {t('languageDescription')}
        </p>
        <div className="row">
          <button
            type="button"
            className={locale === 'sv' ? 'btn btn-primary' : 'btn btn-outline'}
            onClick={() => handleChange('sv' as Locale)}
            disabled={submitting}
          >
            {t('swedish')}
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'btn btn-primary' : 'btn btn-outline'}
            onClick={() => handleChange('en' as Locale)}
            disabled={submitting}
          >
            {t('english')}
          </button>
        </div>
      </div>
    </div>
  );
}
