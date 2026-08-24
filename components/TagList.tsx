'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export interface TagDTO {
  id: string;
  ownerType: string;
  ownerId: string;
  text: string;
  createdAt: string;
}

interface TagListProps {
  ownerType: string;
  ownerId: string;
  // User-requested: Idea/ImportantInfo's own list views show Tags read-only
  // and only when non-empty, never an "Add" affordance -- adding one is
  // only possible from that item's edit form. Unrelated to the Guest
  // question below: a Guest never sees this component mounted at all
  // (spec's "Never" boundary, "No Tags/Links Guest-facing surface"), this
  // is purely the signed-in owner's own view-vs-edit-mode toggle.
  readOnly?: boolean;
}

// FR-15/FR-16/FR-26, spec-tags-links-photos: reusable, generic over
// ownerType/ownerId, mounted on every owning entity's detail/edit view
// (EntryDetailPanel, BlogPostDetailPanel, IdeaCard, ImportantInfoCard) --
// same self-fetching shape as AttachmentList.tsx.
export function TagList({ ownerType, ownerId, readOnly = false }: TagListProps) {
  const router = useRouter();
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
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
          `/api/v1/tags?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as TagDTO[];
        if (!cancelled) setTags(body);
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
    if (submitInFlight.current || !text.trim()) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId, text }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not add this Tag.');
        return;
      }
      setTags((current) => [...current, body as TagDTO]);
      setText('');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }

  async function handleDelete(tag: TagDTO) {
    setError(null);
    setDeletingIds((current) => new Set(current).add(tag.id));
    const previous = tags;
    setTags((current) => current.filter((t) => t.id !== tag.id));

    try {
      const response = await fetch(`/api/v1/tags/${tag.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setTags(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not remove this Tag.');
        return;
      }
      router.refresh();
    } catch {
      setTags(previous);
      setError('Could not reach the server. Please try again.');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(tag.id);
        return next;
      });
    }
  }

  // User-requested compactness: a read-only mount with nothing to show
  // renders nothing at all -- no label, no "No tags yet." placeholder.
  if (readOnly && !loading && tags.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <span className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
        Tags
      </span>

      {error && <div className="form-error-banner">{error}</div>}

      {loading ? (
        <p className="text-soft">Loading…</p>
      ) : (
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          {tags.length === 0 && <span className="text-soft">No tags yet.</span>}
          {tags.map((tag) => (
            <span key={tag.id} className="tag-chip">
              {tag.text}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(tag)}
                  disabled={deletingIds.has(tag.id)}
                  aria-label={`Remove tag ${tag.text}`}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    marginLeft: '0.4rem',
                    padding: 0,
                    color: 'inherit',
                    fontSize: '0.9em',
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!readOnly && (
        <form onSubmit={handleAdd} className="row" style={{ gap: 'var(--space-2)' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a tag…"
            maxLength={50}
            aria-label="New tag text"
            style={{
              border: '1px solid #d6dbde',
              borderRadius: 'var(--radius-input)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.9rem',
            }}
          />
          <button type="submit" className="btn btn-outline" disabled={submitting || !text.trim()}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  );
}
