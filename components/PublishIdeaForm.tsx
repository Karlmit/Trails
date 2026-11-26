'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';

export function PublishIdeaForm({ tripId, ideaId, start, end, isPrivate }: {
  tripId: string;
  ideaId: string;
  start: string;
  end: string;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const blog = useTranslations('tripBlog');
  const ideas = useTranslations('tripIdeas');
  const errors = useTranslations('errors');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ideas/${ideaId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAt: fields.get('startAt'), isPrivate: fields.has('isPrivate') }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(translateApiError(errors, body?.error?.message) ?? ideas('publishError'));
        return;
      }
      router.push(`/trips/${tripId}/timeline`);
      router.refresh();
    } catch {
      setError(ideas('publishError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      {error && <div className="form-error-banner" role="alert">{error}</div>}
      <label className="field">
        {blog('dateLabel')}
        <input type="date" name="startAt" min={start} max={end} required />
      </label>
      <label className="row">
        <input type="checkbox" name="isPrivate" defaultChecked={isPrivate} />
        {blog('privateLabel')}
      </label>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? blog('working') : ideas('convertToEntry')}
        </button>
      </div>
    </form>
  );
}
