'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PRIORITY_LABELS, WEATHER_SUITABILITY_LABELS } from '@/lib/ideas';

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  MUST_DO: 'badge-priority-must-do',
  WOULD_LIKE: 'badge-priority-would-like',
  MAYBE: 'badge-priority-maybe',
};

export interface IdeaDTO {
  id: string;
  tripId: string;
  title: string;
  category: string | null;
  priority: string;
  weatherSuitability: string;
  weatherTags: string[];
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  estimatedExpenseAmount: number | null;
  estimatedExpenseCurrency: string | null;
}

// FR-16/FR-17, spec-ideas: a single Idea's list-item, with a delete action
// (same fetch+confirm+router.refresh pattern as SectionManager's per-item
// delete) and the "Convert to Entry" entry point into
// /trips/[tripId]/ideas/[ideaId]/convert.
export function IdeaCard({ idea }: { idea: IdeaDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete "${idea.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ideas/${idea.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this Idea.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="row-between">
        <h3 style={{ margin: 0 }}>{idea.title}</h3>
        <span className={`badge ${PRIORITY_BADGE_CLASS[idea.priority] ?? 'badge-priority-maybe'}`}>
          {PRIORITY_LABELS[idea.priority] ?? idea.priority}
        </span>
      </div>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {idea.category && <span className="text-soft">{idea.category}</span>}
        <span className="text-soft">
          {WEATHER_SUITABILITY_LABELS[idea.weatherSuitability] ?? idea.weatherSuitability}
        </span>
      </div>

      {(idea.locationName || idea.locationAddress) && (
        <div className="text-soft">
          {[idea.locationName, idea.locationAddress].filter(Boolean).join(' — ')}
          {idea.locationMapLink && (
            <>
              {' '}
              ·{' '}
              <a href={idea.locationMapLink} target="_blank" rel="noreferrer">
                Map
              </a>
            </>
          )}
        </div>
      )}

      {idea.weatherTags.length > 0 && (
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          {idea.weatherTags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      {idea.estimatedExpenseAmount != null && idea.estimatedExpenseCurrency && (
        <div className="text-soft">
          Est. {idea.estimatedExpenseAmount} {idea.estimatedExpenseCurrency}
        </div>
      )}

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Link href={`/trips/${idea.tripId}/ideas/${idea.id}/convert`} className="btn btn-primary">
          Convert to Entry
        </Link>
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
