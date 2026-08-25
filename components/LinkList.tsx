'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export interface LinkDTO {
  id: string;
  ownerType: string;
  ownerId: string;
  url: string;
  label: string | null;
  createdAt: string;
}

interface LinkListProps {
  ownerType: string;
  ownerId: string;
  // See TagList.tsx's identical prop -- owner's own view-vs-edit-mode
  // toggle, unrelated to Guest access (still never mounted for a Guest).
  readOnly?: boolean;
}

// FR-15/FR-16/FR-26, spec-tags-links-photos: same self-fetching shape as
// TagList.tsx -- mounted on every owning entity's detail/edit view, never
// for a Guest.
export function LinkList({ ownerType, ownerId, readOnly = false }: LinkListProps) {
  const t = useTranslations('errors');
  const tShared = useTranslations('shared');
  const router = useRouter();
  const [links, setLinks] = useState<LinkDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const submitInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/v1/links?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as LinkDTO[];
        if (!cancelled) setLinks(body);
      } catch {
        // Leave the list empty -- not a blocking error for the rest of the page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (submitInFlight.current || !url.trim()) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId, url, label: label.trim() || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, body?.error?.message) ?? 'Could not add this Link.');
        return;
      }
      setLinks((current) => [...current, body as LinkDTO]);
      setUrl('');
      setLabel('');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }

  async function handleDelete(link: LinkDTO) {
    setError(null);
    setDeletingIds((current) => new Set(current).add(link.id));
    const previous = links;
    setLinks((current) => current.filter((l) => l.id !== link.id));

    try {
      const response = await fetch(`/api/v1/links/${link.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setLinks(previous);
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? 'Could not remove this Link.');
        return;
      }
      router.refresh();
    } catch {
      setLinks(previous);
      setError('Could not reach the server. Please try again.');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(link.id);
        return next;
      });
    }
  }

  // User-requested compactness: a read-only mount with nothing to show
  // renders nothing at all.
  if (readOnly && !loading && links.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <span className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
        {tShared('linkListLabel')}
      </span>

      {error && <div className="form-error-banner">{error}</div>}

      {loading ? (
        <p className="text-soft">{tShared('linkListLoading')}</p>
      ) : links.length === 0 ? (
        <p className="text-soft">{tShared('linkListEmpty')}</p>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {links.map((link) => (
            <div key={link.id} className="row-between">
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label || link.url}
              </a>
              {!readOnly && (
                <button
                  type="button"
                  className="btn-danger"
                  style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => handleDelete(link)}
                  disabled={deletingIds.has(link.id)}
                >
                  {deletingIds.has(link.id) ? tShared('linkListRemoving') : tShared('linkListRemove')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <form onSubmit={handleAdd} className="row" style={{ gap: 'var(--space-2)' }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tShared('linkListUrlPlaceholder')}
            maxLength={2048}
            aria-label={tShared('linkListUrlLabel')}
            style={{
              border: '1px solid #d6dbde',
              borderRadius: 'var(--radius-input)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.9rem',
              flex: 1,
            }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tShared('linkListLabelPlaceholder')}
            maxLength={200}
            aria-label={tShared('linkListLabelAriaLabel')}
            style={{
              border: '1px solid #d6dbde',
              borderRadius: 'var(--radius-input)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.9rem',
            }}
          />
          <button type="submit" className="btn btn-outline" disabled={submitting || !url.trim()}>
            {submitting ? tShared('linkListAdding') : tShared('linkListAddButton')}
          </button>
        </form>
      )}
    </div>
  );
}
