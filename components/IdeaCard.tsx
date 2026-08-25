'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IdeaForm } from '@/components/IdeaForm';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  MUST_DO: 'badge-priority-must-do',
  WOULD_LIKE: 'badge-priority-would-like',
  MAYBE: 'badge-priority-maybe',
};

export interface IdeaDTO {
  id: string;
  tripId: string;
  sectionId?: string | null;
  title: string;
  category: string | null;
  description: string | null;
  priority: string;
  weatherSuitability: string;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  estimatedExpenseAmount: number | null;
  estimatedExpenseCurrency: string | null;
  // spec-tags-links-photos: the owning Idea's Cover Photo id, if any
  // (app/(web)/trips/[tripId]/ideas/page.tsx queries Photo directly and
  // attaches this per Idea) -- FR-15's "thumbnail in list views", rendered
  // via the same `/api/v1/photos/[id]/file` URL PhotoGallery uses.
  primaryPhotoId?: string | null;
}

// FR-16/FR-17, spec-ideas: a single Idea's list-item, same view<->edit
// toggle pattern as ImportantInfoCard (edit mode swaps in IdeaForm, which
// itself now owns Links/Photos -- see that component). User-requested:
// Section reassignment, Delete, and Links/Photos are only available while
// editing -- the view row is read-only except for the Edit button and the
// "Convert to Entry" action. Ideas have no Tags at all (user-requested
// removal -- redundant with Category).
export function IdeaCard({
  idea,
  sections,
  categoryOptions,
}: {
  idea: IdeaDTO;
  sections: { id: string; name: string }[];
  categoryOptions: string[];
}) {
  const t = useTranslations('errors');
  const ti = useTranslations('tripIdeas');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(ti('confirmDelete', { title: idea.title }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ideas/${idea.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? ti('couldNotDeleteIdea'));
        return;
      }
      router.refresh();
    } catch {
      setError(ti('networkError'));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="stack">
        <IdeaForm
          mode="edit"
          idea={idea}
          tripId={idea.tripId}
          sections={sections}
          categoryOptions={categoryOptions}
          onCancel={() => setEditing(false)}
        />
        {error && <div className="form-error-banner">{error}</div>}
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
          {busy ? ti('deleting') : ti('deleteIdea')}
        </button>
      </div>
    );
  }

  return (
    // User-requested compactness: see ImportantInfoCard.tsx's identical comment.
    <div className="card stack" style={{ padding: 'var(--space-3)', gap: 'var(--space-2)' }}>
      {error && <div className="form-error-banner">{error}</div>}

      <div className="row-between">
        <h3 style={{ margin: 0 }}>{idea.title}</h3>
        <div className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <span className={`badge ${PRIORITY_BADGE_CLASS[idea.priority] ?? 'badge-priority-maybe'}`}>
            {ti(`priority.${idea.priority}`)}
          </span>
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
            {ti('edit')}
          </button>
        </div>
      </div>

      {idea.primaryPhotoId && (
        <Image
          src={`/api/v1/photos/${idea.primaryPhotoId}/file`}
          alt=""
          width={80}
          height={80}
          className="card-cover-photo"
          // See components/PhotoGallery.tsx's identical comment: Next's
          // built-in optimizer can't authenticate against this auth-gated
          // route (verified live), so this renders a plain <img> instead.
          unoptimized
        />
      )}

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {idea.sectionId && (
          <span className="text-soft">{sections.find((s) => s.id === idea.sectionId)?.name}</span>
        )}
        {idea.category && <span className="text-soft">{idea.category}</span>}
        <span className="text-soft">{ti(`weatherSuitability.${idea.weatherSuitability}`)}</span>
      </div>

      {idea.description && <p className="text-soft text-multiline" style={{ margin: 0 }}>{idea.description}</p>}

      {(idea.locationName || idea.locationAddress) && (
        <div className="text-soft">
          {[idea.locationName, idea.locationAddress].filter(Boolean).join(' — ')}
          {idea.locationMapLink && (
            <>
              {' '}
              ·{' '}
              <a href={idea.locationMapLink} target="_blank" rel="noreferrer">
                {ti('map')}
              </a>
            </>
          )}
        </div>
      )}

      {idea.estimatedExpenseAmount != null && idea.estimatedExpenseCurrency && (
        <div className="text-soft">
          {ti('estimatedExpense', {
            amount: idea.estimatedExpenseAmount,
            currency: idea.estimatedExpenseCurrency,
          })}
        </div>
      )}

      <Link href={`/trips/${idea.tripId}/ideas/${idea.id}/convert`} className="btn btn-primary">
        {ti('convertToEntry')}
      </Link>

      <LinkList ownerType="IDEA" ownerId={idea.id} readOnly />
      <PhotoGallery tripId={idea.tripId} ownerType="IDEA" ownerId={idea.id} readOnly />
    </div>
  );
}
