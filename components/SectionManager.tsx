'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { sectionColor } from '@/lib/section-colors';

interface SectionDTO {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function SectionManager({ tripId, sections }: { tripId: string; sections: SectionDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, name, startDate, endDate }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create the Section.');
        return;
      }

      setName('');
      setStartDate('');
      setEndDate('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(sectionId: string) {
    if (!confirm('Delete this Section? Its color band will be removed.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/sections/${sectionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete the Section.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    }
  }

  return (
    <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
      {error && !open && <div className="form-error-banner">{error}</div>}
      {sections.length > 0 && (
        <div className="section-legend">
          {sections.map((section, index) => (
            <div key={section.id} className="section-legend-item">
              <span
                className="section-legend-swatch"
                style={{ ['--swatch-color' as string]: sectionColor(index) }}
              />
              <span>
                {section.name} ({section.startDate} – {section.endDate})
              </span>
              <button
                type="button"
                onClick={() => handleDelete(section.id)}
                className="btn-danger"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <form onSubmit={handleCreate} className="card row" style={{ alignItems: 'flex-end' }}>
          {error && <div className="form-error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="section-name">Section name</label>
            <input id="section-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="section-start">Start</label>
            <input
              id="section-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="section-end">End</label>
            <input
              id="section-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Section'}
          </button>
          <button type="button" className="btn btn-dark-outline" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
          + Add Section
        </button>
      )}
    </div>
  );
}
