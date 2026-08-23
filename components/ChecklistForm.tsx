'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

// FR-21, spec-checklists: create a Checklist. Same toggle-open inline-form
// pattern as IdeaForm/SectionManager -- no new UI pattern introduced.
export function ChecklistForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
        body: JSON.stringify({ tripId, title, description: description || null, isPrivate }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create this Checklist.');
        return;
      }

      setTitle('');
      setDescription('');
      setIsPrivate(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        + Add Checklist
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="checklist-title">Title</label>
        <input
          id="checklist-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="checklist-description">Description</label>
        <textarea
          id="checklist-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <label className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private
      </label>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Checklist'}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
