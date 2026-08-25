'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

// FR-21, spec-checklists: create a Checklist. Same toggle-open inline-form
// pattern as IdeaForm/SectionManager -- no new UI pattern introduced.
export function ChecklistForm({ tripId }: { tripId: string }) {
  const t = useTranslations('errors');
  const tc = useTranslations('tripChecklists');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/v1/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, title, emoji: emoji.trim() || null, isPrivate }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, body?.error?.message) ?? tc('couldNotCreateChecklist'));
        return;
      }

      setTitle('');
      setEmoji('');
      setIsPrivate(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError(tc('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        {tc('openButton')}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="checklist-title">{tc('titleLabel')}</label>
        <input
          id="checklist-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="checklist-emoji">{tc('emojiLabel')}</label>
        <input
          id="checklist-emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={16}
          placeholder="✅"
          style={{ maxWidth: '80px' }}
        />
      </div>

      <label className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        {tc('private')}
      </label>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? tc('adding') : tc('submit')}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={() => setOpen(false)}>
          {tc('cancel')}
        </button>
      </div>
    </form>
  );
}
